import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { clean } from './format'
import { laneOf } from './lanes'
import { renderBand, renderPane } from './render'
import {
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
  norm,
} from './reducers'
import type { FlowInput } from './reducers'

const PANE = 'activity'
const FLOW_TOOL = 'mcp__activity__flow'
const STEP_TOOL = 'mcp__activity__step'

const crew = atom({ plugin: 'activity', key: 'crew' } as const, [])
const flow = atom({ plugin: 'activity', key: 'flow' } as const, null)
const panel = atom({ plugin: 'activity', key: 'panel' } as const, { isDoneCollapsed: false, autoOpenedFor: '', dismissedFor: '' })
const now = atom({ plugin: 'activity', key: 'now' } as const, 0)

async function togglePane($: EngineInterface): Promise<boolean> {
  // A pane that exists but is not seated (an unasked auto-open below the width floor waits undrawn) is not open.
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced && p.isShown)

  if (isOpen) {
    await $.ui.close({ id: PANE })

    return false
  }

  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: 'Crew' })

  return true
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  let shouldOpen = false

  await update($, panel, prev => {
    shouldOpen = prev.autoOpenedFor !== key

    return shouldOpen ? { ...prev, autoOpenedFor: key } : prev
  })

  if (shouldOpen) {
    void $.ui.open({ id: PANE, title: 'Crew' }).catch(() => {})
  }
}

// Ticks the clocks of running rows once a second; quiet when nothing runs.
async function tick($: EngineInterface): Promise<void> {
  const rows = await read($, crew)

  if (!rows.some(r => r.status === 'running')) {
    return
  }

  const at = await $.clock.now()
  await update($, now, () => at)
}

export const register: Register = (on, options) => {
  const wantsTools = options.reportTools !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const at = await $.clock.now()
    const model = await $.session.model()

    await update($, crew, rows => ensureMain(rows, model, at))
    await update($, now, () => at)

    if (wantsTools) {
      await $.tool.register({
        name: 'flow',
        description:
          'Report a plan to the activity panel and the band above the prompt. Call it after presenting a plan (title, tasks, phase), ' +
          'when a task is accepted (done), when the phase changes, and once at the end with finished: true. Fields left out keep their previous value.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short name of the overall task, a few words.' },
            phases: { type: 'array', items: { type: 'string' }, description: 'Optional ordered phase names, free-form.' },
            phase: { type: 'string', description: 'The current phase name.' },
            total: { type: 'integer', minimum: 0, description: 'Number of planned tasks.' },
            done: { type: 'integer', minimum: 0, description: 'Number of tasks finished.' },
            finished: { type: 'boolean', description: 'True once the whole flow is closed.' },
            tasks: {
              type: 'array',
              description: 'The planned tasks in order, numbered from 1. A title should equal the Agent tool description the task is delegated with, so the panel can match runs to tasks.',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'A few words.' },
                  lane: { type: 'string', description: 'A lane name for color grouping, optional.' },
                  after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
                },
                required: ['title'],
              },
            },
          },
        },
      })

      await $.tool.register({
        name: 'step',
        description:
          'For subagents: report progress on your own task to the activity panel. Call it right after reading your brief with `total` ' +
          '(your plan in 3-8 steps) and `done: 0`, then again as each step finishes. Cheap and silent: it only draws a bar.',
        inputSchema: {
          type: 'object',
          properties: {
            done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
            total: { type: 'integer', minimum: 1, description: 'Steps planned; may change.' },
            note: { type: 'string', description: 'The step in progress, a few words.' },
          },
          required: ['done'],
        },
      })
    }

    await $.command.register({ name: 'activity', description: 'Show or hide the activity panel: every agent, its model, tokens and cost' })
    $.clock.every(1000, () => {
      void tick($).catch(() => {})
    })

    return started
  })

  on('command.run', { command: 'activity' }, async $ => {
    const isOpen = await togglePane($)

    return { text: isOpen ? 'Activity panel opened' : 'Activity panel closed' }
  })

  if (wantsTools) {
    on('tool.call', { tool: FLOW_TOOL }, async ($, e) => {
      if (e.agentId) {
        return { result: 'ignored: only the main session reports the flow' }
      }

      const input = e as unknown as FlowInput
      let isNew = false
      let merged = blankFlow()

      await update($, flow, prev => {
        isNew = isNewFlow(prev, input)
        merged = mergeFlow(prev, input)

        return merged
      })

      if (isNew) {
        await update($, crew, rows => rows.filter(r => r.id === 'main' || r.status === 'running'))
        await update($, panel, prev => ({ ...prev, dismissedFor: '', autoOpenedFor: '' }))
      }

      // A finishing call must not auto-open the pane under the session key.
      if (merged.tasks.length > 0 && !merged.isFinished) {
        await autoOpen($, bandKey(merged))
      }

      return { result: `ok: ${flowLabel(merged) || 'flow updated'}` }
    }).catch(() => ({ result: 'ignored: the activity panel could not record this' }))

    // A worker's own progress: the call runs in the worker's loop, so agentId names it.
    on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
      const input = e as unknown as { done?: number; total?: number; note?: string }
      const agentId = e.agentId

      if (!agentId) {
        return { result: 'ignored: only subagents report steps' }
      }

      await update($, crew, rows => applyStepReport(rows, agentId, input))

      return { result: 'ok' }
    }).catch(() => ({ result: 'ignored: the activity panel could not record this' }))
  }

  // Observers: they call next first. If our bookkeeping throws afterwards the engine keeps next's result, so the call's own result is never lost and nothing runs twice; only our bookkeeping for that one event is (hence no .catch).
  // This covers agent.spawn, turn.step and turn.complete.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    if (started.deny !== undefined || started.agentId === undefined) {
      return started
    }

    const at = await $.clock.now()
    const f = await read($, flow)
    const description = clean(e.description, 80)
    const reported = f?.tasks.find(t => norm(t.title) === norm(description))?.lane

    const hadRunning = (await read($, crew)).some(r => r.id !== 'main' && r.status === 'running')

    // A subagent's first turn.step could in theory land before this row exists; model requests take seconds, this takes milliseconds.
    await update($, crew, rows =>
      applySpawn(rows, {
        id: started.agentId,
        agentId: started.agentId,
        type: e.subagentType,
        lane: laneOf(e.subagentType, reported),
        description,
        model: started.model,
        at,
      }),
    )
    await update($, now, () => at)

    if (!hadRunning) {
      await update($, panel, prev => (prev.dismissedFor === 'session' ? { ...prev, dismissedFor: '' } : prev))
    }

    await autoOpen($, bandKey(f))

    return started
  })

  // Each model request: live context, tokens and cost, for the main loop and every subagent.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (result.usage) {
      const usage = result.usage

      await update($, crew, rows =>
        applyStep(rows, { agentId: e.agentId, model: e.model, effort: typeof e.effort === 'string' ? e.effort : undefined, usage }),
      )
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const at = await $.clock.now()

    await update($, crew, rows => applyComplete(rows, { agentId: e.agentId, reason: e.reason, at, usage: e.usage ?? null }))
    await update($, now, () => at)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const rows = await read($, crew)
    const f = await read($, flow)
    const p = await read($, panel)

    if (e.props.hasSurvey || !isBandShown(rows, f, p.dismissedFor === bandKey(f))) {
      return below
    }

    return renderBand($.ui.resolve(e), {
      rows,
      flow: f,
      below,
      onOpen: () => void togglePane($).catch(() => {}),
      onDismiss: () => {
        void (async () => {
          const current = await read($, flow)
          await update($, panel, prev => ({ ...prev, dismissedFor: bandKey(current) }))
        })().catch(() => {})
      },
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const rows = await read($, crew)
    const f = await read($, flow)
    const p = await read($, panel)
    const at = await read($, now)
    const usage = await $.session.usage().catch(() => null)

    return renderPane($.ui.resolve(e), {
      rows,
      flow: f,
      panel: p,
      at,
      sessionUsd: usage?.cost?.usd,
      columns: e.props.bodyColumns,
      surface: e.surface,
      onToggleDone: () => void update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed })).catch(() => {}),
    })
  })
}
