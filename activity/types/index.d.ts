export type RowStatus = 'running' | 'done' | 'failed'

export type Row = {
  id: string
  agentId?: string
  lane: string
  type: string
  description: string
  model: string
  effort?: string
  status: RowStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax?: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

export type PlannedTask = { n: number; title: string; lane: string; after: number[] }

export type Flow = {
  title: string
  phases: string[]
  phase: string
  total: number
  done: number
  isFinished: boolean
  tasks: PlannedTask[]
}

export type Panel = { isDoneCollapsed: boolean; autoOpenedFor: string; dismissedFor: string }

declare module 'claude-code' {
  interface PluginState {
    'activity': { crew: Row[]; flow: Flow | null; panel: Panel; now: number }
  }
}
