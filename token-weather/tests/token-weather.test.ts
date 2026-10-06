import { describe, expect, test } from 'claude-code/testing'

describe('token-weather', () => {
  test('the band follows the context window', async ($, on) => {
    let tokens = 36_100

    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        rateLimits: [],
        context: { tokens, window: 200_000, percent: Math.round(tokens / 2_000) }
      }
    }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    const ui = await $.ui.mount({
      plugin: 'token-weather',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 }
    } as any)

    expect(await ui.find({ type: 'Text', text: /Clear/ })).toBeDefined()

    tokens = 134_400
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)

    expect(await ui.find({ type: 'Text', text: /Showers/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /67% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▲ \+98\.3k last turn/ })).toBeDefined()

    await ui.unmount()
  })

  async function mountWith(context: { tokens: number; window: number; percent: number }) {
    const { $, on } = current
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context } }))
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    return $.ui.mount({
      plugin: 'token-weather',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 }
    } as any)
  }

  let current: { $: any; on: any }

  test('a count that rounds up to a million prints M, never 1000k', async ($, on) => {
    current = { $, on }
    const ui = await mountWith({ tokens: 999_960, window: 2_000_000, percent: 50 })

    expect(await ui.find({ type: 'Text', text: /1M \/ 2M/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1000k/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a non-finite percent (NaN reaches the lookup as junk) does not throw and reads as clear', async ($, on) => {
    current = { $, on }
    const ui = await mountWith({ tokens: 10, window: 200_000, percent: 'n/a' as unknown as number })

    expect(await ui.find({ type: 'Text', text: /Clear/ })).toBeDefined()
    await ui.unmount()
  })

  test('a percent above every limit is the red forecast', async ($, on) => {
    current = { $, on }
    const ui = await mountWith({ tokens: 190_000, window: 200_000, percent: 95 })

    expect(await ui.find({ type: 'Text', text: /Compact soon/ })).toBeDefined()
    await ui.unmount()
  })
})
