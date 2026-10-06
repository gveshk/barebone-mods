import type { Flow, PlannedTask, Row } from '../types'
import { clean } from './format'
import { laneOf } from './lanes'
import { costOf, windowOf } from './prices'
import type { Usage } from './prices'

export const MAX_ROWS = 200

export const norm = (text: string): string => text.trim().toLowerCase()

export const whole = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback

// New work processed: cache reads are excluded (they are priced separately, in costOf).
const fresh = (u: Usage): number => (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
// Context fill: the whole prompt plus this reply.
const sum = (u: Usage): number => fresh(u) + (u.cache_read_input_tokens || 0)

// Over the cap, drop the oldest FINISHED rows first; main and running rows are never evicted,
// so the cap is soft while many agents run at once.
function trim(rows: Row[]): Row[] {
  let extra = rows.length - MAX_ROWS

  if (extra <= 0) {
    return rows
  }

  return rows.filter(r => {
    if (extra > 0 && r.id !== 'main' && r.status !== 'running') {
      extra--

      return false
    }

    return true
  })
}

const isTarget = (r: Row, agentId: string | undefined): boolean => (agentId === undefined ? r.id === 'main' : r.agentId === agentId)

// --- rows -------------------------------------------------------------------

export type SpawnInfo = {
  id: string
  agentId?: string
  type: string
  lane: string
  description: string
  model: string
  at: number
}

export function applySpawn(rows: Row[], s: SpawnInfo): Row[] {
  if (rows.some(r => r.id === s.id)) {
    return rows.map(r =>
      r.id === s.id ? { ...r, status: 'running', endedAt: undefined, model: s.model, contextMax: windowOf(s.model) ?? r.contextMax } : r,
    )
  }

  const round = s.description === '' ? 1 : 1 + rows.filter(r => norm(r.description) === norm(s.description)).length

  const row: Row = {
    id: s.id,
    agentId: s.agentId,
    lane: s.lane,
    type: s.type,
    description: s.description,
    model: s.model,
    status: 'running',
    startedAt: s.at,
    contextTokens: 0,
    contextMax: windowOf(s.model),
    tokens: 0,
    costUsd: 0,
    steps: 0,
    round,
  }

  return trim([...rows, row])
}

export function ensureMain(rows: Row[], model: string, at: number): Row[] {
  if (rows.some(r => r.id === 'main')) {
    return rows
  }

  const main: Row = {
    id: 'main',
    lane: 'main',
    type: 'main',
    description: 'main session',
    model,
    status: 'done',
    startedAt: at,
    contextTokens: 0,
    contextMax: windowOf(model),
    tokens: 0,
    costUsd: 0,
    steps: 0,
    round: 1,
  }

  return [main, ...rows]
}

export type StepInfo = {
  agentId?: string
  model?: string
  effort?: string
  usage: Usage & { model?: string }
}

export function applyStep(rows: Row[], s: StepInfo): Row[] {
  return rows.map(r => {
    if (!isTarget(r, s.agentId)) {
      return r
    }

    const model = s.usage.model || s.model || r.model

    return {
      ...r,
      model,
      effort: s.effort ?? r.effort,
      status: 'running',
      endedAt: undefined,
      contextTokens: sum(s.usage),
      contextMax: windowOf(model) ?? r.contextMax,
      tokens: r.tokens + fresh(s.usage),
      costUsd: r.costUsd + costOf(model, s.usage),
      steps: r.steps + 1,
    }
  })
}

export type CompleteInfo = {
  agentId?: string
  reason: string
  at: number
  usage?: (Usage & { model: string }) | null
}

export function applyComplete(rows: Row[], c: CompleteInfo): Row[] {
  return rows.map(r => {
    if (!isTarget(r, c.agentId)) {
      return r
    }

    const status = c.agentId === undefined || c.reason === 'answer' ? 'done' : 'failed'
    const useTurn = r.steps === 0 && c.usage

    return {
      ...r,
      status,
      endedAt: c.at,
      ...(useTurn && c.usage
        ? { model: c.usage.model || r.model, tokens: fresh(c.usage), costUsd: costOf(c.usage.model || r.model, c.usage) }
        : {}),
    }
  })
}

export function applyStepReport(rows: Row[], agentId: string, input: { done?: number; total?: number; note?: string }): Row[] {
  return rows.map(r => {
    if (r.agentId !== agentId) {
      return r
    }

    const total = whole(input.total, r.stepTotal ?? 0)
    const done = whole(input.done, r.stepDone ?? 0)

    return { ...r, stepTotal: total, stepDone: total > 0 ? Math.min(total, done) : done, stepNote: typeof input.note === 'string' ? clean(input.note, 60) || undefined : r.stepNote }
  })
}

// main is the session itself, so it does not count as a running or failed agent.
export const totals = (rows: Row[]): { tokens: number; costUsd: number; running: number; failed: number } =>
  rows.reduce(
    (t, r) => ({
      tokens: t.tokens + r.tokens,
      costUsd: t.costUsd + r.costUsd,
      running: t.running + (r.id !== 'main' && r.status === 'running' ? 1 : 0),
      failed: t.failed + (r.id !== 'main' && r.status === 'failed' ? 1 : 0),
    }),
    { tokens: 0, costUsd: 0, running: 0, failed: 0 },
  )

// --- flow -------------------------------------------------------------------

export type FlowInput = {
  title?: string
  phases?: string[]
  phase?: string
  total?: number
  done?: number
  finished?: boolean
  tasks?: Array<{ title?: string; lane?: string; after?: number[] }>
}

export const blankFlow = (): Flow => ({ title: '', phases: [], phase: '', total: 0, done: 0, isFinished: false, tasks: [] })

const MAX_TASKS = 50
const MAX_PHASES = 12
const text = (v: unknown, max: number): string => (typeof v === 'string' ? clean(v, max) : '')

// A call starts a NEW flow when there is none, or the previous one finished and this call carries a
// title or tasks, or it names a different title (compared case-insensitively). A call without a title
// or tasks updates the current flow, and a title arriving for an untitled flow keeps its tasks.
export function isNewFlow(prev: Flow | null, input: FlowInput): boolean {
  const title = text(input.title, 60)

  if (prev === null) {
    return true
  }

  if (prev.isFinished) {
    return title !== '' || (Array.isArray(input.tasks) && input.tasks.length > 0)
  }

  return title !== '' && prev.title !== '' && norm(title) !== norm(prev.title)
}

export function mergeFlow(prev: Flow | null, input: FlowInput): Flow {
  const isNew = isNewFlow(prev, input)
  const base = prev !== null && !isNew ? prev : blankFlow()
  const items: unknown[] | null = Array.isArray(input.tasks) ? input.tasks.slice(0, MAX_TASKS) : null

  const tasks: PlannedTask[] = items
    ? items.map((raw, i) => {
        const item = (typeof raw === 'string' ? { title: raw } : raw && typeof raw === 'object' ? raw : {}) as {
          title?: unknown
          lane?: unknown
          after?: unknown
        }
        const after = Array.isArray(item.after)
          ? [...new Set(item.after.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= items.length && n !== i + 1))]
          : []

        return { n: i + 1, title: text(item.title, 80), lane: laneOf('', typeof item.lane === 'string' ? item.lane : undefined), after }
      })
    : base.tasks

  const total = items ? Math.max(tasks.length, whole(input.total, tasks.length)) : whole(input.total, base.total)
  const isFinished = typeof input.finished === 'boolean' ? input.finished : base.isFinished

  return {
    title: text(input.title, 60) || base.title,
    phases: Array.isArray(input.phases) ? input.phases.map(p => text(p, 24)).filter(p => p !== '').slice(0, MAX_PHASES) : base.phases,
    phase: isFinished ? 'done' : typeof input.phase === 'string' ? clean(input.phase, 24) : base.phase,
    total,
    done: Math.min(whole(input.done, base.done), total),
    isFinished,
    tasks,
  }
}

export const flowLabel = (f: Flow): string => {
  const progress = f.total > 0 ? `${f.done}/${f.total}` : ''

  return [f.phase, progress].filter(Boolean).join(' · ')
}

export const plannedOf = (f: Flow, rows: Row[]): PlannedTask[] =>
  f.tasks.filter(t => !rows.some(r => norm(r.description) === norm(t.title)))

// A finished flow is history: the pane still shows it, but it neither keeps the band alive nor owns a dismissal.
const live = (f: Flow | null): Flow | null => (f && !f.isFinished ? f : null)

// Which band a dismissal or an auto-open belongs to: the live named flow, or the session when there is none.
export const bandKey = (f: Flow | null): string => {
  const l = live(f)

  return l ? `flow:${l.title}` : 'session'
}

// The band shows for a live flow or while any subagent runs, unless the person dismissed it.
export const isBandShown = (rows: Row[], f: Flow | null, isDismissed = false): boolean =>
  !isDismissed && (live(f) !== null || rows.some(r => r.id !== 'main' && r.status === 'running'))
