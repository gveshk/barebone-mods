import { describe, expect, test } from 'claude-code/testing'

import type { Flow, Row } from '../types'
import {
  MAX_ROWS,
  applyComplete,
  applySpawn,
  applyStep,
  applyStepReport,
  bandKey,
  blankFlow,
  ensureMain,
  flowLabel,
  isBandShown,
  isNewFlow,
  mergeFlow,
  plannedOf,
  totals,
} from '../hooks/reducers'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
const row = (over: Partial<Row> = {}): Row => ({
  id: 'a1',
  agentId: 'a1',
  lane: 'Explore',
  type: 'Explore',
  description: 'scan repo',
  model: 'claude-sonnet-5-5',
  status: 'running',
  startedAt: 1000,
  contextTokens: 0,
  tokens: 0,
  costUsd: 0,
  steps: 0,
  round: 1,
  ...over,
})
const usage = (over: Record<string, unknown> = {}) => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'claude-sonnet-5-5',
  ...over,
})
const spawn = (over = {}) => ({
  id: 'a1',
  agentId: 'a1',
  type: 'Explore',
  lane: 'Explore',
  description: 'scan repo',
  model: 'claude-sonnet-5-5',
  at: 1000,
  ...over,
})

describe('applySpawn', () => {
  test('adds a running row with its context window', () => {
    const rows = applySpawn([], spawn())
    expect(rows.length).toBe(1)
    expect(rows[0]!.status).toBe('running')
    expect(rows[0]!.lane).toBe('Explore')
    expect(rows[0]!.contextMax).toBe(1_000_000)
    expect(rows[0]!.startedAt).toBe(1000)
    expect(rows[0]!.round).toBe(1)
  })

  test('counts rounds of the same description and replaces the same id', () => {
    const one = applySpawn([], spawn())
    const two = applySpawn(one, spawn({ id: 'a2', agentId: 'a2', description: '  SCAN repo ' }))
    expect(two[1]!.round).toBe(2)
    const again = applySpawn(two, spawn({ id: 'a2', agentId: 'a2', description: 'other' }))
    expect(again.length).toBe(2)
  })

  test('caps finished rows only', () => {
    let rows = ensureMain([], 'claude-opus-5-5', 0)
    for (let i = 0; i < MAX_ROWS + 5; i++) {
      rows = applyComplete(applySpawn(rows, spawn({ id: `x${i}`, agentId: `x${i}`, description: `d${i}` })), {
        agentId: `x${i}`,
        reason: 'answer',
        at: 1,
      })
    }
    expect(rows.length).toBe(MAX_ROWS)
    expect(rows[0]!.id).toBe('main')
    expect(rows[rows.length - 1]!.id).toBe(`x${MAX_ROWS + 4}`)
  })

  test('running rows are never evicted', () => {
    let rows: Row[] = []
    for (let i = 0; i < MAX_ROWS + 5; i++) {
      rows = applySpawn(rows, spawn({ id: `x${i}`, agentId: `x${i}`, description: `d${i}` }))
    }
    expect(rows.length).toBe(MAX_ROWS + 5)
  })

  test('a duplicate spawn is a resume that keeps the counters', () => {
    const a = applySpawn([], spawn())
    const b = applyStep(a, { agentId: 'a1', usage: usage({ input_tokens: 100 }) })
    const c = applyComplete(b, { agentId: 'a1', reason: 'answer', at: 5 })
    const d = applySpawn(c, spawn({ model: 'claude-opus-5-5' }))
    expect(d.length).toBe(1)
    expect(d[0]!.tokens).toBe(100)
    expect(d[0]!.round).toBe(1)
    expect(d[0]!.status).toBe('running')
    expect(d[0]!.endedAt).toBeUndefined()
    expect(d[0]!.model).toBe('claude-opus-5-5')
  })
})

describe('ensureMain', () => {
  test('prepends one main row and is idempotent', () => {
    const rows = ensureMain([], 'claude-opus-5-5', 500)
    expect(rows.length).toBe(1)
    expect([rows[0]!.id, rows[0]!.lane, rows[0]!.type, rows[0]!.description]).toEqual(['main', 'main', 'main', 'main session'])
    expect(rows[0]!.status).toBe('done')
    expect(rows[0]!.startedAt).toBe(500)
    expect(ensureMain(rows, 'x', 9)).toBe(rows)
  })
})

describe('applyStep', () => {
  test('accumulates tokens, cost, steps and context for one agent', () => {
    const rows = applyStep([row(), row({ id: 'b', agentId: 'b' })], {
      agentId: 'a1',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      usage: usage({ input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000 }),
    })
    expect(rows[0]!.tokens).toBe(1500)
    expect(close(rows[0]!.costUsd, 0.0074)).toBe(true)
    expect(rows[0]!.steps).toBe(1)
    expect(rows[0]!.contextTokens).toBe(3500)
    expect(rows[0]!.effort).toBe('high')
    expect(rows[0]!.status).toBe('running')
    expect(rows[1]!.tokens).toBe(0)
  })

  test('no agentId means the main row', () => {
    const main = ensureMain([], 'claude-opus-5-5', 0)
    const rows = applyStep([...main, row()], { usage: usage({ input_tokens: 10, model: 'claude-opus-5-5' }) })
    expect(rows[0]!.tokens).toBe(10)
    expect(rows[0]!.status).toBe('running')
    expect(rows[1]!.tokens).toBe(0)
  })

  test('an unknown model keeps the window unknown and prices at the fallback', () => {
    const rows = applyStep([row({ model: 'mystery', contextMax: undefined })], {
      agentId: 'a1',
      usage: usage({ model: 'mystery', input_tokens: 1_000_000 }),
    })
    expect(rows[0]!.contextMax).toBeUndefined()
    expect(close(rows[0]!.costUsd, 5)).toBe(true)
  })
})

describe('applyComplete', () => {
  test('a subagent answer is done, anything else failed', () => {
    expect(applyComplete([row()], { agentId: 'a1', reason: 'answer', at: 5000 })[0]!.status).toBe('done')
    expect(applyComplete([row()], { agentId: 'a1', reason: 'error', at: 5000 })[0]!.status).toBe('failed')
    expect(applyComplete([row()], { agentId: 'a1', reason: 'answer', at: 5000 })[0]!.endedAt).toBe(5000)
  })

  test('main never shows failed', () => {
    const main = ensureMain([], 'claude-opus-5-5', 0)
    expect(applyComplete(main, { reason: 'aborted', at: 9 })[0]!.status).toBe('done')
  })

  test('uses the turn usage only when no steps were seen', () => {
    const withUsage = { agentId: 'a1', reason: 'answer', at: 5000, usage: usage({ input_tokens: 100, output_tokens: 100 }) }
    expect(applyComplete([row({ steps: 0 })], withUsage)[0]!.tokens).toBe(200)
    expect(applyComplete([row({ steps: 2, tokens: 7 })], withUsage)[0]!.tokens).toBe(7)
  })
})

describe('flow', () => {
  test('a new flow numbers its tasks and defaults their lane', () => {
    const f = mergeFlow(null, {
      title: 'Ship',
      phases: ['plan', 'build'],
      phase: 'plan',
      tasks: [{ title: 'a', lane: 'build' }, { title: 'b' }],
    })
    expect(f.title).toBe('Ship')
    expect(f.total).toBe(2)
    expect(f.tasks[0]).toEqual({ n: 1, title: 'a', lane: 'build', after: [] })
    expect(f.tasks[1]!.lane).toBe('agent')
    expect(f.done).toBe(0)
    expect(f.isFinished).toBe(false)
  })

  test('the same title updates in place, a new title resets', () => {
    const f = mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }, { title: 'b' }] })
    const g = mergeFlow(f, { title: 'Ship', done: 1, phase: 'build' })
    expect(g.tasks.length).toBe(2)
    expect(g.done).toBe(1)
    expect(g.phase).toBe('build')
    expect(mergeFlow(g, { title: 'Other' }).tasks.length).toBe(0)
  })

  test('done is clamped to total and finishing closes the flow', () => {
    const f = mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], done: 9 })
    expect(f.done).toBe(3)
    const end = mergeFlow(f, { finished: true })
    expect(end.isFinished).toBe(true)
    expect(end.phase).toBe('done')
    expect(mergeFlow(end, { title: 'Next' }).isFinished).toBe(false)
  })

  test('a finished flow survives a title-less update', () => {
    const f = mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }] })
    const g = mergeFlow(f, { finished: true })
    const h = mergeFlow(g, { done: 1 })
    expect(h.isFinished).toBe(true)
    expect(h.title).toBe('Ship')
    expect(h.tasks.length).toBe(1)
  })

  test('an untitled flow keeps its tasks when a title arrives', () => {
    expect(mergeFlow(mergeFlow(null, { tasks: [{ title: 'a' }] }), { title: 'Ship' }).tasks.length).toBe(1)
  })

  test('a case-only title change keeps the plan', () => {
    const g = mergeFlow(mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }] }), { title: 'ship', done: 1 })
    expect(g.tasks.length).toBe(1)
    expect(g.done).toBe(1)
  })

  test('string tasks are accepted', () => {
    expect(mergeFlow(null, { tasks: ['a', 'b'] as never }).tasks.map(t => t.title)).toEqual(['a', 'b'])
  })

  test('hostile input does not throw', () => {
    const f = mergeFlow(null, { tasks: 'nope', phases: 'x', title: 5, phase: 7, finished: 'yes', done: 'many' } as never)
    expect(f.tasks).toEqual([])
    expect(f.phases).toEqual([])
    expect(mergeFlow(null, { tasks: [null, 5] } as never).tasks.length).toBe(2)
  })

  test('after is sanitised', () => {
    const f = mergeFlow(null, { tasks: [{ title: 'a' }, { title: 'b', after: [1, 1, 2, 3, 9] }, { title: 'c' }] })
    expect(f.tasks[1]!.after).toEqual([1, 3])
  })

  test('total clamps up to the task count and tasks are capped', () => {
    expect(mergeFlow(null, { tasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], total: 1 }).total).toBe(3)
    const many = Array.from({ length: 60 }, (_, i) => ({ title: `t${i}` }))
    expect(mergeFlow(null, { tasks: many }).tasks.length).toBe(50)
  })

  test('isNewFlow', () => {
    const f = mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }] })
    expect(isNewFlow(null, {})).toBe(true)
    expect(isNewFlow(mergeFlow(f, { finished: true }), { done: 1 })).toBe(false)
    expect(isNewFlow(mergeFlow(f, { finished: true }), { title: 'Next' })).toBe(true)
    expect(isNewFlow(f, { title: 'Other' })).toBe(true)
    expect(isNewFlow(f, { title: 'SHIP' })).toBe(false)
  })

  test('flowLabel, plannedOf, isBandShown', () => {
    const f: Flow = { ...blankFlow(), phase: 'build', done: 1, total: 2 }
    expect(flowLabel(f)).toBe('build · 1/2')
    expect(flowLabel({ ...f, total: 0 })).toBe('build')
    expect(flowLabel(blankFlow())).toBe('')
    const g = mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }, { title: 'b' }] })
    expect(plannedOf(g, [row({ description: 'A ' })]).map(t => t.title)).toEqual(['b'])
    expect(isBandShown([row()], null)).toBe(true)
    expect(isBandShown([row({ status: 'done' })], null)).toBe(false)
    expect(isBandShown([], g)).toBe(true)
    expect(isBandShown(ensureMain([], 'm', 0), null)).toBe(false)
    expect(isBandShown([row()], null, true)).toBe(false)
    expect(isBandShown([], g, true)).toBe(false)
    expect(bandKey(null)).toBe('session')
    expect(bandKey(g)).toBe('flow:Ship')
  })

  test('a finished flow neither shows the band nor owns a dismissal', () => {
    const g = mergeFlow(null, { title: 'Ship', tasks: [{ title: 'a' }] })
    const finishedFlow = mergeFlow(g, { finished: true })

    expect(isBandShown([], finishedFlow)).toBe(false)
    expect(isBandShown([row()], finishedFlow)).toBe(true)
    expect(bandKey(finishedFlow)).toBe('session')
  })

  test('mergeFlow caps phases at 12', () => {
    const phases = Array.from({ length: 30 }, (_, i) => `phase ${i + 1}`)

    expect(mergeFlow(null, { phases }).phases.length).toBe(12)
    expect(mergeFlow(null, { phases }).phases[11]).toBe('phase 12')
  })
})

describe('step reports and totals', () => {
  test('applyStepReport sets and clamps progress for one agent', () => {
    const rows = applyStepReport([row(), row({ id: 'b', agentId: 'b' })], 'a1', { done: 9, total: 3, note: ' reading ' })
    expect([rows[0]!.stepDone, rows[0]!.stepTotal, rows[0]!.stepNote]).toEqual([3, 3, 'reading'])
    expect(rows[1]!.stepTotal).toBeUndefined()
  })

  test('applyStepReport keeps an omitted note, ignores a bad one, clears an empty one', () => {
    const withNote = applyStepReport([row()], 'a1', { done: 1, total: 3, note: 'reading' })
    expect(applyStepReport(withNote, 'a1', { done: 2 })[0]!.stepNote).toBe('reading')
    expect(applyStepReport(withNote, 'a1', { note: 5 as never })[0]!.stepNote).toBe('reading')
    expect(applyStepReport(withNote, 'a1', { note: '' })[0]!.stepNote).toBeUndefined()
  })

  test('totals excludes main from running', () => {
    const main = ensureMain([], 'm', 0).map(r => ({ ...r, status: 'running' as const }))
    expect(totals([...main, row()]).running).toBe(1)
  })

  test('totals', () => {
    const t = totals([row({ tokens: 10, costUsd: 1 }), row({ id: 'b', status: 'failed', tokens: 5, costUsd: 0.5 })])
    expect(t).toEqual({ tokens: 15, costUsd: 1.5, running: 1, failed: 1 })
  })
})
