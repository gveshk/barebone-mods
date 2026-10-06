import type { Row } from '../types'
import { clean } from './format'
import { FAILED, laneColor } from './lanes'
import { rowText } from './row-text'
import { SPRITE_CSS, spriteGroup } from './sprite'

export const ROW_H = 84
const TEXT_X = 108
const MIN_WIDTH = 200

export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The row is a self-contained dark card with fixed colours: as an image it cannot see the app's theme
// (prefers-color-scheme follows the OS), so it must be legible on any panel by itself.
const CARD = '#1f1e1d'
const BORDER = '#333331'
const TITLE = '#ececec'
const SUB = '#a8a8a4'
const TRACK = '#333331'
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

const ROW_CSS = `<style>
.live{animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
${SPRITE_CSS}
</style>`

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

// Cut at the last ' · ' boundary that fits, so a narrow row never shows half a value.
const fit = (text: string, max: number): string => {
  const safe = clean(text, 1000)

  if ([...safe].length <= max) {
    return safe
  }

  const head = [...safe].slice(0, max).join('')
  const cut = head.lastIndexOf(' · ')

  return cut > 0 ? `${head.slice(0, cut)}…` : clean(safe, max)
}

// One crew row as a single SVG: the desktop wraps sibling elements, so the whole row is one drawing.
export function rowSvg(r: Row, width: number, at: number): string {
  const w = finite(width) ? Math.max(MIN_WIDTH, Math.floor(width)) : MIN_WIDTH
  const text = rowText(r, at)
  const accent = laneColor(r.lane)
  const dot = r.status === 'failed' ? FAILED : accent
  const room = w - TEXT_X - 10
  const titleMax = Math.max(8, Math.floor(room / 7.5)) // 14px semi-bold, ~7.5px per character
  const lineMax = Math.max(8, Math.floor(room / 5.8)) // 12px, ~5.8px per character
  const total = finite(r.stepTotal) && r.stepTotal > 0 ? Math.min(9999, Math.floor(r.stepTotal)) : 0
  const done = total > 0 ? Math.min(total, Math.max(0, Math.floor(finite(r.stepDone) ? r.stepDone : 0))) : 0
  const trackW = Math.max(20, w - TEXT_X - 56)

  const progress =
    total > 0
      ? `<rect x="${TEXT_X}" y="68" width="${trackW}" height="6" rx="3" fill="${TRACK}"/>` +
        `<rect x="${TEXT_X}" y="68" width="${Math.round(trackW * (done / total))}" height="6" rx="3" fill="${accent}"/>` +
        `<text x="${TEXT_X + trackW + 8}" y="75" font-size="11" fill="${SUB}">${done}/${total}</text>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ROW_H}" viewBox="0 0 ${w} ${ROW_H}" font-family="${FONT}">` +
    ROW_CSS +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${ROW_H - 1}" rx="10" fill="${CARD}" stroke="${BORDER}"/>` +
    spriteGroup(5, r.status, 8, 4) +
    `<circle${r.status === 'running' ? ' class="live"' : ''} cx="100" cy="18" r="4" fill="${dot}"/>` +
    `<text x="${TEXT_X}" y="22" font-size="14" font-weight="600" fill="${TITLE}">${esc(clean(text.title + text.mark, titleMax))}</text>` +
    `<text x="${TEXT_X}" y="42" font-size="12" fill="${SUB}">${esc(fit(text.model + text.note, lineMax))}</text>` +
    `<text x="${TEXT_X}" y="60" font-size="12" fill="${SUB}">${esc(fit(text.stats, lineMax))}</text>` +
    progress +
    `</svg>`
  )
}
