import { describe, expect, test } from 'claude-code/testing'

import type { Row } from '../types'
import { rowText } from '../hooks/row-text'
import { ROW_H, esc, rowSvg } from '../hooks/svg-rows'

const row = (over: Partial<Row> = {}): Row => ({
  id: 'a1',
  agentId: 'a1',
  lane: 'Explore',
  type: 'Explore',
  description: 'scan repo',
  model: 'claude-sonnet-5-5',
  effort: 'high',
  status: 'running',
  startedAt: 1000,
  contextTokens: 500_000,
  contextMax: 1_000_000,
  tokens: 134_400,
  costUsd: 2.414,
  steps: 3,
  round: 1,
  ...over,
})

describe('rowText', () => {
  test('builds the text lines for a row', () => {
    const t = rowText(row({ endedAt: 66_000 }), 99_999)
    expect(t.title).toBe('scan repo')
    expect(t.model).toBe('Sonnet 5.5 · high')
    expect(t.stats).toBe('est. $2.41 · 01:05 · 134.4k tok · ctx 50%')
  })

  test('uses the clock for running rows, marks finished ones, hides unknown context', () => {
    expect(rowText(row(), 66_000).stats.includes('01:05')).toBe(true)
    expect(rowText(row({ status: 'done' }), 0).mark).toBe(' ✓')
    expect(rowText(row({ status: 'failed' }), 0).mark).toBe(' ✕')
    expect(rowText(row({ contextMax: undefined }), 0).stats.includes('ctx')).toBe(false)
    expect(rowText(row({ stepNote: 'reading' }), 0).note).toBe(' · reading')
  })

  test('falls back to the type and truncates long descriptions', () => {
    expect(rowText(row({ description: '' }), 0).title).toBe('Explore')
    expect(rowText(row({ description: 'x'.repeat(100) }), 0).title.length).toBe(60)
  })

  test('cleans the step note', () => {
    expect(rowText(row({ stepNote: 'ab' }), 0).note).toBe(' · ab')
  })

  test('leads the stats with the cost', () => {
    expect(rowText(row(), 0).stats.startsWith('est. ')).toBe(true)
  })

  test('strips control characters from an unknown model id', () => {
    expect(rowText(row({ model: 'x\u001b[31mevil', effort: undefined }), 0).model).toBe('xevil')
  })
})

describe('rowSvg', () => {
  test('is a sized, animated SVG for a running row with a progress bar', () => {
    const svg = rowSvg(row({ stepDone: 1, stepTotal: 4 }), 480, 66_000)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.includes(`viewBox="0 0 480 ${ROW_H}"`)).toBe(true)
    expect(svg.includes('class="lg0"')).toBe(true)
    expect(svg.includes('1/4')).toBe(true)
    expect(svg.includes('Sonnet 5.5')).toBe(true)
  })

  test('the status dot pulses once a second, like the image refresh', () => {
    expect(rowSvg(row({}), 480, 0).includes('pulse 1s')).toBe(true)
  })

  test('escapes untrusted text', () => {
    const svg = rowSvg(row({ description: '<script>alert(1)</script>' }), 480, 0)
    expect(svg.includes('<script>')).toBe(false)
    expect(svg.includes('&lt;script&gt;')).toBe(true)
    expect(esc('a&b"c')).toBe('a&amp;b&quot;c')
  })

  test('escapes the apostrophe', () => {
    expect(esc("it's")).toBe('it&#39;s')
  })

  test('output is well formed for hostile numbers', () => {
    const bad = /NaN|Infinity|undefined|width="-/
    const rows = [
      row({ stepDone: 10, stepTotal: 4 }),
      row({ stepDone: 3, stepTotal: -4 }),
      row({ stepDone: NaN, stepTotal: Infinity }),
      row({ tokens: NaN }),
      row({ stepDone: 1e308, stepTotal: 1e308 }),
      row({ stepDone: 5e307, stepTotal: 1e308 }),
    ]

    for (const r of rows) {
      expect(bad.test(rowSvg(r, 480, 0))).toBe(false)
      expect(bad.test(rowSvg(r, NaN, 0))).toBe(false)
      expect(bad.test(rowSvg(r, -50, 0))).toBe(false)
      expect(bad.test(rowSvg(r, 0, 0))).toBe(false)
    }
  })

  test('the progress count is clamped to the total', () => {
    const svg = rowSvg(row({ stepDone: 10, stepTotal: 4 }), 480, 0)
    expect(svg.includes('4/4')).toBe(true)
    expect(svg.includes('10/4')).toBe(false)
  })

  test('the width has a floor', () => {
    expect(rowSvg(row(), 100, 0).includes('viewBox="0 0 200 84"')).toBe(true)
  })

  test('is a self-contained card that ignores the OS theme', () => {
    const svg = rowSvg(row(), 480, 0)
    expect(svg.includes('font-family="system-ui')).toBe(true)
    expect(svg.includes('fill="#1f1e1d"')).toBe(true)
    expect(svg.includes('prefers-color-scheme')).toBe(false)
  })

  test('a narrow width truncates text and keeps the cost', () => {
    const svg = rowSvg(row({ description: 'x'.repeat(60) }), 240, 66000)
    expect(svg.includes('…')).toBe(true)
    expect(svg.includes('est. $2.41')).toBe(true)
  })

  test('narrow rows cut at separators, never mid-value', () => {
    const svg = rowSvg(row({ stepNote: 'reading files' }), 240, 66000)
    expect(svg.includes('est. $2.41 · 01:05…')).toBe(true)
    expect(svg.includes('01:…')).toBe(false)
    expect(svg.includes('Sonnet 5.5 · high…')).toBe(true)
    expect(svg.includes('hig…')).toBe(false)
  })

  test('a wide row shows the full lines', () => {
    const svg = rowSvg(row({ stepNote: 'reading files' }), 480, 66000)
    expect(svg.includes('est. $2.41 · 01:05 · 134.4k tok · ctx 50%')).toBe(true)
    expect(svg.includes('Sonnet 5.5 · high · reading files')).toBe(true)
  })

  test('only a running row pulses', () => {
    expect(rowSvg(row(), 480, 0).includes('class="live"')).toBe(true)
    expect(rowSvg(row({ status: 'done' }), 480, 0).includes('class="live"')).toBe(false)
    expect(rowSvg(row({ status: 'failed' }), 480, 0).includes('class="live"')).toBe(false)
  })

  test('hostile text stays escaped on every line', () => {
    const svg = rowSvg(row({ description: '<b>', model: 'a&b', stepNote: '"q"' }), 480, 0)
    expect(svg.includes('<b>')).toBe(false)
    expect(svg.includes('a&amp;b')).toBe(true)
    expect(svg.includes('&quot;q&quot;')).toBe(true)
  })

  test('a finished row is still and a failed row has a red dot', () => {
    expect(rowSvg(row({ status: 'done' }), 480, 0).includes('class="lg1"')).toBe(false)
    expect(rowSvg(row({ status: 'failed' }), 480, 0).includes('#e5484d')).toBe(true)
  })
})
