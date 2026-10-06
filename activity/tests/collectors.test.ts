import { describe, expect, test } from 'claude-code/testing'

import { bandProps, sonnetStep, stubEngine } from './stubs'

const spawnArgs = {
  tool_use_id: 't1',
  prompt: 'p',
  description: 'scan repo',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
}

describe('collectors', () => {
  test('spawn, step and complete drive the band', async ($, on) => {
    stubEngine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
    on('turn.step', async function* () {
      return sonnetStep
    })
    on('turn.complete', () => ({ text: '' }))

    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    expect(await ui.find({ type: 'Text', text: /running/ })).toBeUndefined()

    await $.agent.spawn(spawnArgs as any)
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()

    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'a1' } as any)
    for await (const _chunk of stream) {
      /* drain */
    }
    expect(await ui.find({ type: 'Text', text: /1 running · 12 tok/ })).toBeDefined()

    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, agentId: 'a1' } as any)
    expect(await ui.find({ type: 'Text', text: /running/ })).toBeUndefined()

    await ui.unmount()
  })

  test('session.start registers the report tools, and the flow tool fills the band', async ($, on) => {
    const registered: string[] = []
    stubEngine(on, registered)

    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    expect(registered).toEqual(['flow', 'step'])

    const r = await $.tool.call({
      tool: 'mcp__activity__flow',
      title: 'Ship it',
      phases: ['plan', 'build'],
      phase: 'build',
      tasks: [{ title: 'a' }, { title: 'b' }],
      done: 1,
    } as any)
    expect(String((r as any).result).startsWith('ok')).toBe(true)
    expect(await ui.find({ type: 'Text', text: /Ship it/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /build · 1\/2/ })).toBeDefined()

    const s = await $.tool.call({ tool: 'mcp__activity__step', done: 1, total: 3 } as any)
    expect(String((s as any).result).includes('ignored')).toBe(true)

    await ui.unmount()
  })

  test('/activity toggles the pane', async ($, on) => {
    stubEngine(on)
    const opened = await $.command.run({ command: 'activity' } as any)
    expect(String((opened as any).text).includes('opened')).toBe(true)
  })

  test('an untitled flow with tasks opens the pane once', async ($, on) => {
    const opens: unknown[] = []
    stubEngine(on, [], opens)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    await $.tool.call({ tool: 'mcp__activity__flow', tasks: [{ title: 'a' }] } as any)
    expect(opens.length).toBe(1)
    await $.tool.call({ tool: 'mcp__activity__flow', tasks: [{ title: 'a' }] } as any)
    expect(opens.length).toBe(1)
  })

  test('a spawn without an agentId leaves no row', async ($, on) => {
    stubEngine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5' }))

    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.agent.spawn(spawnArgs as any)
    expect(await ui.find({ type: 'Text', text: /running/ })).toBeUndefined()

    await ui.unmount()
  })

  test('reportTools: false registers no tools', { options: { reportTools: false } }, async ($, on) => {
    const registered: string[] = []
    stubEngine(on, registered)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    expect(registered).toEqual([])
  })

  test('/activity toggles both ways', async ($, on) => {
    // A second on('ui.panes') is refused ("registered twice"), so the stub takes the open panes as an argument.
    stubEngine(on, [], [], [{ id: 'activity', title: 'Crew', isShown: true, isFocused: false, isPlaced: true }])
    const closed = await $.command.run({ command: 'activity' } as any)
    expect(String((closed as any).text).includes('closed')).toBe(true)
  })

  test('dismissing the band hides it while an agent runs and keeps the flow', async ($, on) => {
    stubEngine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.tool.call({ tool: 'mcp__activity__flow', title: 'Ship', tasks: [{ title: 'scan repo' }, { title: 'other' }] } as any)
    await $.agent.spawn(spawnArgs as any)
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()

    await ui.press({ key: 'dismiss' })
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeUndefined()
    expect(await ui.find({ key: 'dismiss' })).toBeUndefined()

    const r = await $.tool.call({ tool: 'mcp__activity__flow', done: 1 } as any)
    expect(String((r as any).result)).toContain('1/2')
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a new flow with the same title shows and opens the pane again', async ($, on) => {
    const opens: unknown[] = []
    stubEngine(on, [], opens)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    await $.tool.call({ tool: 'mcp__activity__flow', title: 'Same', tasks: [{ title: 'a' }, { title: 'b' }] } as any)
    expect(await ui.find({ type: 'Text', text: /Same/ })).toBeDefined()
    await ui.press({ key: 'dismiss' })
    expect(await ui.find({ type: 'Text', text: /Same/ })).toBeUndefined()

    await $.tool.call({ tool: 'mcp__activity__flow', finished: true } as any)
    await $.tool.call({ tool: 'mcp__activity__flow', title: 'Same', tasks: [{ title: 'x' }] } as any)
    expect(await ui.find({ type: 'Text', text: /Same/ })).toBeDefined()
    expect(opens.length).toBe(2)
    await ui.unmount()
  })

  test('/activity opens a pane that exists but is not seated', async ($, on) => {
    const opens: unknown[] = []
    stubEngine(on, [], opens, [{ id: 'activity', title: 'Crew', isShown: false, isFocused: false, isPlaced: false }])
    const r = await $.command.run({ command: 'activity' } as any)
    expect(String((r as any).text).includes('opened')).toBe(true)
    expect(opens.length).toBe(1)
  })

  test('the band disappears when a flow finishes with no agents running', async ($, on) => {
    stubEngine(on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.tool.call({ tool: 'mcp__activity__flow', title: 'Ship', tasks: [{ title: 'a' }] } as any)
    expect(await ui.find({ type: 'Text', text: /Ship/ })).toBeDefined()

    await $.tool.call({ tool: 'mcp__activity__flow', finished: true } as any)
    expect(await ui.find({ type: 'Text', text: /Ship/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a dismissal made while a flow was live does not hide a later batch of agents', async ($, on) => {
    stubEngine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.tool.call({ tool: 'mcp__activity__flow', title: 'Ship', tasks: [{ title: 'a' }] } as any)
    await ui.press({ key: 'dismiss' })
    expect(await ui.find({ type: 'Text', text: /Ship/ })).toBeUndefined()

    await $.tool.call({ tool: 'mcp__activity__flow', finished: true } as any)
    await $.agent.spawn(spawnArgs as any)
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()
    await ui.unmount()
  })

  test('a session dismissal expires when a new batch of agents starts', async ($, on) => {
    stubEngine(on)
    let spawned = 0
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++spawned}` }))
    on('turn.complete', () => ({ text: '' }))
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as any)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    await $.agent.spawn(spawnArgs as any)
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()
    await ui.press({ key: 'dismiss' })
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeUndefined()

    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, agentId: 'a1' } as any)
    await $.agent.spawn({ ...spawnArgs, tool_use_id: 't2', description: 'second batch' } as any)
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()
    await ui.unmount()
  })
})
