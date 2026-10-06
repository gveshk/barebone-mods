import { describe, expect, test } from 'claude-code/testing'

import { sonnetStep, stubEngine } from './stubs'

const paneProps = { title: 'Crew', isFocused: false, bodyColumns: 60, placement: 'dock' }
const spawnArgs = {
  tool_use_id: 't1',
  prompt: 'p',
  description: 'scan repo',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
}

async function seed($: any, on: any): Promise<void> {
  stubEngine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('turn.step', async function* () {
    return sonnetStep
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  await $.agent.spawn(spawnArgs as any)
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'a1' } as any)
  for await (const _chunk of stream) {
    /* drain */
  }
}

// n subagents, each spawned and completed; reason 'error' makes them fail.
async function seedMany($: any, on: any, n: number, reason = 'answer'): Promise<void> {
  stubEngine(on)
  let spawned = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++spawned}` }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

  for (let i = 1; i <= n; i++) {
    await $.agent.spawn({ ...spawnArgs, tool_use_id: `t${i}`, description: `job ${i}` } as any)
    await $.turn.complete({ reason, answer: 'ok', durationMs: 1, agentId: `a${i}` } as any)
  }
}

describe('pane', () => {
  test('terminal pane draws the crab as a Raster plus the row text', async ($, on) => {
    await seed($, on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    const raster = (await ui.find({ type: 'Raster' })) as any
    expect(raster).toBeDefined()
    expect(raster.props.columns).toBe(17)
    expect(raster.props.rows).toBe(7)
    expect(await ui.find({ type: 'Text', text: /scan repo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /12 tok/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /session \$1\.50/ })).toBeDefined()
    await ui.unmount()
  })

  test('a narrow terminal pane drops the sprite but keeps the text', async ($, on) => {
    await seed($, on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: { ...paneProps, bodyColumns: 30 } } as any)

    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /scan repo/ })).toBeDefined()
    await ui.unmount()
  })

  test('desktop pane draws rows as SVG, the pinned main row first', async ($, on) => {
    await seed($, on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'desktop', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    const svg = (await ui.find({ type: 'Svg' })) as any
    expect(svg).toBeDefined()
    expect(String(svg.props.source).includes('Opus 5.5')).toBe(true)
    expect(String(svg.props.alt).includes('main session')).toBe(true)
    expect(await ui.find({ type: 'Text', text: /Running · 1/ })).toBeDefined()
    await ui.unmount()
  })

  test('the sprite needs 60 columns', async ($, on) => {
    await seed($, on)
    const narrow = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: { ...paneProps, bodyColumns: 59 } } as any)
    expect(await narrow.find({ type: 'Raster' })).toBeUndefined()
    await narrow.unmount()

    const wide = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: { ...paneProps, bodyColumns: 60 } } as any)
    expect(await wide.find({ type: 'Raster' })).toBeDefined()
    await wide.unmount()
  })

  test('only the newest 20 finished rows are drawn, with a count of the older ones', async ($, on) => {
    await seedMany($, on, 25)
    const ui = (await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)) as any

    expect(await ui.find({ type: 'Text', text: /\+5 older/ })).toBeDefined()
    const toggle = (await ui.find({ key: 'toggle-done' })) as any
    expect(String(toggle.props.label).includes('Finished · 25')).toBe(true)
    expect((await ui.findAll({ type: 'Raster' })).length).toBeLessThanOrEqual(21)
    await ui.unmount()
  })

  test('the Finished toggle collapses and restores the rows', async ($, on) => {
    await seedMany($, on, 2)
    const ui = (await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)) as any

    expect(await ui.find({ type: 'Text', text: /job 1/ })).toBeDefined()
    expect(String(((await ui.find({ key: 'toggle-done' })) as any).props.label).startsWith('▾')).toBe(true)

    await ui.press({ key: 'toggle-done' })
    expect(await ui.find({ type: 'Text', text: /job 1/ })).toBeUndefined()
    expect(String(((await ui.find({ key: 'toggle-done' })) as any).props.label).startsWith('▸')).toBe(true)

    await ui.press({ key: 'toggle-done' })
    expect(await ui.find({ type: 'Text', text: /job 1/ })).toBeDefined()
    await ui.unmount()
  })

  test('a failed subagent shows in the Finished label, also when collapsed', async ($, on) => {
    await seedMany($, on, 2, 'error')
    const ui = (await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)) as any

    expect(String(((await ui.find({ key: 'toggle-done' })) as any).props.label).includes('2 failed')).toBe(true)
    await ui.press({ key: 'toggle-done' })
    expect(String(((await ui.find({ key: 'toggle-done' })) as any).props.label).includes('2 failed')).toBe(true)
    await ui.unmount()
  })

  test('a planned task is listed', async ($, on) => {
    stubEngine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.tool.call({ tool: 'mcp__activity__flow', tasks: [{ title: 'not started yet' }] } as any)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    expect(await ui.find({ type: 'Text', text: /not started yet/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Planned · 1/ })).toBeDefined()
    await ui.unmount()
  })

  test('an empty pane says so', async ($, on) => {
    stubEngine(on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    expect(await ui.find({ type: 'Text', text: /No subagents yet/ })).toBeDefined()
    await ui.unmount()
  })

  test('the no-subagents line shows below the main row and goes away with the first agent', async ($, on) => {
    await seed($, on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    expect(await ui.find({ type: 'Text', text: /No subagents yet/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the terminal step bar clamps an absurd total', async ($, on) => {
    await seed($, on)
    await $.tool.call({ tool: 'mcp__activity__step', agentId: 'a1', done: 1e300, total: 1e300 } as any)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'terminal', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    expect(await ui.find({ type: 'Text', text: /e\+/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /9999\/9999/ })).toBeDefined()
    await ui.unmount()
  })

  test('the desktop alt text carries the stats that only the image shows', async ($, on) => {
    await seed($, on)
    const ui = await $.ui.mount({ plugin: 'activity', surface: 'desktop', component: 'Pane', requestId: 'activity', props: paneProps } as any)

    const svg = (await ui.find({ type: 'Svg' })) as any
    expect(String(svg.props.alt).includes('est. $')).toBe(true)
    await ui.unmount()
  })
})

