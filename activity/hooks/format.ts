export const short = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) {
    return '0'
  }

  // 999_950 rounds to 1.0M, so promote before toFixed can print "1000k".
  if (n >= 999_950) {
    return `${+(n / 1_000_000).toFixed(1)}M`
  }

  if (n >= 1_000) {
    return `${+(n / 1_000).toFixed(1)}k`
  }

  return String(Math.round(n))
}

export const duration = (ms: number): string => {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (n: number): string => String(n).padStart(2, '0')

  return hours > 0 ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}` : `${pad(minutes)}:${pad(seconds % 60)}`
}

export const usd = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) {
    return '$0.00'
  }

  return n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`
}

// Majors and minors are 1-2 digits, so a date suffix (20250514) never reads as a version.
const MODEL = /(fable|mythos|opus|sonnet|haiku)-(\d{1,2})(?!\d)(?:-(\d{1,2})(?!\d))?/i

// An id that is not a known family is returned as is: clean() it before drawing.
export const modelName = (id: string): string => {
  const match = MODEL.exec(id)

  if (!match) {
    return /^[a-z]+$/i.test(id) ? id.charAt(0).toUpperCase() + id.slice(1).toLowerCase() : id
  }

  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase()

  return match[3] ? `${family} ${match[2]}.${match[3]}` : `${family} ${match[2]}`
}

export const percent = (n: number, of: number): number =>
  Number.isFinite(n) && of > 0 ? Math.min(100, Math.max(0, Math.round((100 * n) / of))) : 0

export const bar = (ratio: number, width: number): string => {
  const cells = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0
  const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
  const filled = Math.round(r * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

// Agent descriptions and notes are model output: drop terminal escapes and
// every control/format/unassigned character, fold whitespace, cap by code point.
// This makes text safe for a TERMINAL. Text drawn into SVG must ALSO be XML-escaped
// (`esc` in svg-rows.ts) after clean(): clean() leaves `& < > " '` untouched.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const UNSEEN = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}]/gu

export const clean = (text: string, max: number): string => {
  const limit = Math.floor(max)

  if (!(limit > 0)) {
    return ''
  }

  const safe = text
    .replace(ESCAPES, '')
    .replace(/\s+/g, ' ')
    .replace(UNSEEN, '')
    .replace(/ {2,}/g, ' ')
    .trim()
  const points = [...safe]

  return points.length > limit ? `${points.slice(0, limit - 1).join('').trimEnd()}…` : safe
}
