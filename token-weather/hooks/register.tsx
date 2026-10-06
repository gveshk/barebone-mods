import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reading } from '../types'

const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'

const FORECAST = [
  { upTo: 25, icon: '☀', word: 'Clear', color: 'yellow' },
  { upTo: 50, icon: '☁', word: 'Cloudy', color: 'cyan' },
  { upTo: 75, icon: '☂', word: 'Showers', color: 'blue' },
  { upTo: 90, icon: '☇', word: 'Storm', color: 'magenta' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', color: 'red' }
] as const

// Held by the host, so the history survives a hot reload of this file.
const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await takeReading($)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (!e.agentId) {
      await takeReading($) // main-loop turns only, not subagents
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const history = await read($, readings)

    if (e.props.hasSurvey || history.length === 0) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = history[history.length - 1]!
    const percent = Number.isFinite(now.percent) ? now.percent : 0
    const forecast = FORECAST.find(f => percent < f.upTo) ?? FORECAST[FORECAST.length - 1]!
    const isWide = e.props.bodyColumns >= 60

    return (
      <Box flexDirection="column">
        {below}
        <Box paddingX={1}>
          <Text color={forecast.color} bold>
            {forecast.icon}  {forecast.word}
          </Text>
          <Text>{`  ${percent}% of context`}</Text>
          <Text dimColor>{`  ${short(now.tokens)} / ${short(now.window)}`}</Text>
          {isWide && <Text dimColor>{'   last turns '}</Text>}
          {isWide && <Text color={forecast.color}>{sparkline(history)}</Text>}
          {isWide && history.length > 1 && <Text dimColor>{trend(history)}</Text>}
        </Box>
      </Box>
    )
  })
}

async function takeReading($: EngineInterface) {
  const { context } = await $.session.usage()

  if (!context?.window) {
    return
  }

  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  const reading: Reading = { tokens, window: context.window, percent }

  await update($, readings, history => [...history, reading].slice(-HISTORY))
}

function sparkline(history: Reading[]) {
  const top = Math.max(...history.map(r => r.tokens), 1)

  return history.map(r => BARS[Math.floor((r.tokens / top) * (BARS.length - 1))]).join('')
}

function trend(history: Reading[]) {
  const delta = history[history.length - 1]!.tokens - history[history.length - 2]!.tokens

  if (delta === 0) {
    return '  steady'
  }

  return delta > 0 ? `  ▲ +${short(delta)} last turn` : `  ▼ ${short(-delta)} last turn`
}

function short(n: number) {
  // 999_950 rounds to 1.0M, so promote before toFixed can print "1000k".
  if (n >= 999_950) {
    return `${+(n / 1_000_000).toFixed(1)}M`
  }

  if (n >= 1_000) {
    return `${+(n / 1_000).toFixed(1)}k`
  }

  return String(n)
}
