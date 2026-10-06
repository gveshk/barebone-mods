import type { Row } from '../types'
import { clean, duration, modelName, percent, short, usd } from './format'

// The text of one crew row, shared by the terminal and desktop renderers.
export function rowText(r: Row, at: number): { title: string; model: string; stats: string; mark: string; note: string } {
  const context = r.contextMax ? ` · ctx ${percent(r.contextTokens, r.contextMax)}%` : ''

  return {
    title: clean(r.description || r.type, 60),
    model: clean(`${modelName(r.model)}${r.effort ? ` · ${r.effort}` : ''}`, 40),
    stats: `est. ${usd(r.costUsd)} · ${duration((r.endedAt ?? at) - r.startedAt)} · ${short(r.tokens)} tok${context}`,
    mark: r.status === 'done' ? ' ✓' : r.status === 'failed' ? ' ✕' : '',
    note: r.stepNote ? ` · ${clean(r.stepNote, 60)}` : '',
  }
}
