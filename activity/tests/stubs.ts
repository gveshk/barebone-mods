// Request events have no implementation under test unless stubbed.
export function stubEngine(on: (...args: any[]) => unknown, registered: string[] = [], opens: unknown[] = [], panes: unknown[] = []): void {
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  // When a hook hides itself it calls next(e); under test something beneath must answer ui.render.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('tool.register', (_$: unknown, e: { name: string }) => {
    registered.push(e.name)

    return { value: { tool: `mcp__activity__${e.name}` } }
  })
  on('command.register', () => ({ value: { command: 'activity' } }))
  on('ui.open', (_$: unknown, e: unknown) => {
    opens.push(e)

    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: panes }))
  on('session.usage', () => ({
    value: { startedAt: 0, rateLimits: [], context: { window: 1_000_000 }, cost: { usd: 1.5 } },
  }))
}

export const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 }

export const sonnetStep = {
  turnId: 't',
  index: 0,
  answer: '',
  toolUses: [],
  stopReason: 'end_turn',
  usage: { model: 'claude-sonnet-5-5', input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
}
