import type { ElementTable } from 'claude-code'

import type { Flow, Panel, Row } from '../types'
import { bar, short, usd } from './format'
import { FAILED, laneColor } from './lanes'
import { flowLabel, plannedOf, totals } from './reducers'
import { rowText } from './row-text'
import { spriteRaster } from './sprite'
import { ROW_H, rowSvg } from './svg-rows'

const DONE = '#5fbf8f'
const ACCENT = '#8f8cf4'

export type BandData = {
  rows: Row[]
  flow: Flow | null
  below: unknown
  onOpen: () => void
  onDismiss: () => void
}

export function renderBand(ui: ElementTable, d: BandData) {
  const { Box, Text, Button } = ui
  const t = totals(d.rows)
  const running = d.rows.filter(r => r.id !== 'main' && r.status === 'running').length
  const label = d.flow ? flowLabel(d.flow) : ''

  return (
    <Box flexDirection="column">
      {d.below}
      <Box flexDirection="row" gap={2}>
        <Text color={running > 0 ? ACCENT : DONE}>●</Text>
        <Text bold wrap="truncate-end">
          {d.flow?.title || 'agents'}
        </Text>
        {label !== '' && <Text>{label}</Text>}
        <Text dimColor>{`${running} running · ${short(t.tokens)} tok · est. ${usd(t.costUsd)}`}</Text>
        <Button key="crew" label={`×${d.rows.filter(r => r.id !== 'main').length}`} plain onPress={d.onOpen} />
        <Button key="dismiss" label="✕" plain role="dismiss" onPress={d.onDismiss} />
      </Box>
    </Box>
  )
}

export type PaneData = {
  rows: Row[]
  flow: Flow | null
  panel: Panel
  at: number
  sessionUsd?: number
  columns: number
  surface: string
  onToggleDone: () => void
}

// The stats line needs about 42 cells next to the 17-wide sprite.
const SPRITE_MIN_COLUMNS = 60
const MAX_FINISHED = 20

function terminalRow(ui: ElementTable, r: Row, d: PaneData) {
  const { Box, Text } = ui
  const Raster = (ui as any).Raster
  const text = rowText(r, d.at)
  const accent = laneColor(r.lane)
  const frame = (r.status === 'running' ? Math.floor(d.at / 1000) % 2 : 0) as 0 | 1
  const sprite = Raster !== undefined && d.columns >= SPRITE_MIN_COLUMNS ? spriteRaster(r.status, frame) : null
  const total = Number.isFinite(r.stepTotal) && (r.stepTotal ?? 0) > 0 ? Math.min(9999, Math.floor(r.stepTotal!)) : 0
  const rawDone = Number.isFinite(r.stepDone) ? Math.floor(r.stepDone!) : 0
  const done = total > 0 ? Math.min(total, Math.max(0, rawDone)) : 0
  const ratio = total > 0 ? done / total : 0

  return (
    <Box key={r.id} flexDirection="row" gap={1} marginBottom={1} alignItems="center">
      {sprite && (
        <Box flexShrink={0} width={sprite.columns}>
          <Raster key={`sprite-${r.id}`} columns={sprite.columns} rows={sprite.rows} cells={sprite.cells} />
        </Box>
      )}
      <Box flexDirection="column" flexShrink={1}>
        <Text wrap="truncate-end">
          <Text color={r.status === 'failed' ? FAILED : accent}>● </Text>
          <Text bold>{text.title}</Text>
          {text.mark}
        </Text>
        <Text dimColor wrap="truncate-end">
          {text.model + text.note}
        </Text>
        <Text wrap="truncate-end">{text.stats}</Text>
        {total > 0 ? <Text color={accent}>{`${bar(ratio, 16)} ${done}/${total}`}</Text> : null}
      </Box>
    </Box>
  )
}

function desktopRow(ui: ElementTable, r: Row, d: PaneData) {
  const Svg = (ui as any).Svg
  const text = rowText(r, d.at)
  const width = Math.max(240, Math.min(900, d.columns * 8 - 24))

  return (
    <Svg
      key={r.id}
      source={rowSvg(r, width, d.at)}
      alt={`${text.title}: ${text.model}, ${r.status}, ${text.stats}`}
      width={width}
      height={ROW_H}
    />
  )
}

export function renderPane(ui: ElementTable, d: PaneData) {
  const { Box, Text, Button } = ui
  const hasSvg = d.surface !== 'terminal' && (ui as any).Svg !== undefined
  const row = (r: Row) => (hasSvg ? desktopRow(ui, r, d) : terminalRow(ui, r, d))

  const main = d.rows.find(r => r.id === 'main')
  const agents = d.rows.filter(r => r.id !== 'main')
  const running = agents.filter(r => r.status === 'running')
  const finished = agents.filter(r => r.status !== 'running')
  const failedCount = finished.filter(r => r.status === 'failed').length
  const shownFinished = finished.slice(-MAX_FINISHED)
  const planned = d.flow ? plannedOf(d.flow, d.rows) : []
  const t = totals(d.rows)
  const session = d.sessionUsd !== undefined ? ` · session ${usd(d.sessionUsd)}` : ''

  return (
    <Box flexDirection="column">
      <Text bold>{`Crew · ${t.running} running · ${short(t.tokens)} tok · est. ${usd(t.costUsd)}${session}`}</Text>
      {d.flow ? <Text dimColor>{`${d.flow.title}${flowLabel(d.flow) ? ' · ' + flowLabel(d.flow) : ''}`}</Text> : null}
      <Box marginTop={1} flexDirection="column">
        {main ? row(main) : null}
        {agents.length === 0 ? <Text dimColor>No subagents yet</Text> : null}
        {running.length > 0 ? <Text dimColor>{`Running · ${running.length}`}</Text> : null}
        {running.map(row)}
        {finished.length > 0 ? (
          <Button
            key="toggle-done"
            plain
            label={`${d.panel.isDoneCollapsed ? '▸' : '▾'} Finished · ${finished.length}${failedCount > 0 ? ` · ${failedCount} failed` : ''}`}
            onPress={d.onToggleDone}
          />
        ) : null}
        {!d.panel.isDoneCollapsed && finished.length > shownFinished.length ? (
          <Text dimColor>{`+${finished.length - shownFinished.length} older`}</Text>
        ) : null}
        {!d.panel.isDoneCollapsed && shownFinished.map(row)}
        {planned.length > 0 ? <Text dimColor>{`Planned · ${planned.length}`}</Text> : null}
        {planned.map(p => (
          <Box key={`plan-${p.n}`} flexDirection="column" marginBottom={1}>
            <Text dimColor wrap="truncate-end">{`▢ ${p.n}. ${p.title} ◷`}</Text>
            <Text dimColor wrap="truncate-end">{`  ${p.lane}${p.after.length ? ' · after ' + p.after.join(', ') : ''}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
