// The Barebone crab: a friendly coral crab with a skull on its head. An original
// character on a 17x14 pixel grid. One grid feeds both the desktop SVG and the
// terminal Raster, so the two always match.
export const WIDTH = 17
export const HEIGHT = 14
export const LEG_ROW = 12

export const PALETTE = {
  o: '#F0876A', // coral body
  s: '#D9694A', // coral shade
  k: '#2B2320', // ink
  w: '#FFFFFF', // glint
  p: '#FFB0A0', // blush
  b: '#F2EDE4', // bone
} as const

export type Key = keyof typeof PALETTE
export type Grid = Array<Array<Key | '.'>>
export type SpriteState = 'running' | 'done' | 'failed'

export function buildFrame(frame: 0 | 1, state: SpriteState = 'running'): Grid {
  const g: Grid = Array.from({ length: HEIGHT }, () => Array<Key | '.'>(WIDTH).fill('.'))
  const put = (x: number, y: number, key: Key): void => {
    g[y]![x] = key
  }

  // body, rounded corners, shaded bottom row
  for (let y = 5; y <= 11; y++) {
    for (let x = 3; x <= 13; x++) {
      if ((x === 3 || x === 13) && (y === 5 || y === 11)) {
        continue
      }

      put(x, y, y === 11 ? 's' : 'o')
    }
  }

  // raised pincers
  for (const [x, y] of [[1, 6], [1, 7], [2, 7], [1, 8], [2, 8], [15, 6], [14, 7], [15, 7], [14, 8], [15, 8]] as const) {
    put(x, y, 'o')
  }

  // eyes: tall 2x3, a glint on the top-left pixel unless the agent failed
  for (const ex of [5, 10]) {
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        put(ex + dx, 6 + dy, 'k')
      }
    }

    put(ex, 6, state === 'failed' ? 'k' : 'w')
  }

  // blush
  for (const [x, y] of [[4, 9], [5, 9], [11, 9], [12, 9]] as const) {
    put(x, y, 'p')
  }

  // smile, or a frown when failed
  const mouth = state === 'failed' ? ([[7, 10], [9, 10], [8, 9]] as const) : ([[7, 9], [9, 9], [8, 10]] as const)

  for (const [x, y] of mouth) {
    put(x, y, 'k')
  }

  // legs, two walk frames
  for (const x of frame === 0 ? [4, 6, 10, 12] : [5, 7, 9, 11]) {
    put(x, 12, 's')
    put(x, 13, 's')
  }

  // the skull on its head
  ;['.bbb.', 'bkbkb', '.bbb.', '.b.b.'].forEach((row, dy) => {
    ;[...row].forEach((char, dx) => {
      if (char !== '.') {
        put(9 + dx, 1 + dy, char as Key)
      }
    })
  })

  return g
}

// --- terminal: Raster cells -------------------------------------------------

const DEFAULT = 0x01000000
const rgb = (hex: string): number => parseInt(hex.slice(1), 16)

export function rasterCells(grid: Grid): { columns: number; rows: number; cells: number[] } {
  const rows = Math.ceil(grid.length / 2)
  const cells: number[] = []

  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < WIDTH; x++) {
      const topKey = grid[2 * r]?.[x] ?? '.'
      const bottomKey = grid[2 * r + 1]?.[x] ?? '.'
      const top = topKey === '.' ? null : rgb(PALETTE[topKey])
      const bottom = bottomKey === '.' ? null : rgb(PALETTE[bottomKey])

      if (top === null && bottom === null) {
        cells.push(0x20, DEFAULT, DEFAULT)
      } else if (bottom === null) {
        cells.push(0x2580, top!, DEFAULT)
      } else if (top === null) {
        cells.push(0x2584, bottom, DEFAULT)
      } else {
        cells.push(0x2580, top, bottom)
      }
    }
  }

  return { columns: WIDTH, rows, cells }
}

// Hand-rolled: the plugin sandbox has no Buffer or btoa.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: number[]): string {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)

    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!
    out += c === undefined ? '=' : B64[n & 63]!
  }

  return out
}

// Little-endian u32 per word, as the Raster element's `cells` expects.
export function encodeCells(words: number[]): string {
  const bytes: number[] = []

  for (const w of words) {
    bytes.push(w & 255, (w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255)
  }

  return base64(bytes)
}

// Pure and tiny (6 combinations): cached because the pane redraws every second.
const rasterCache = new Map<string, { columns: number; rows: number; cells: string }>()

export function spriteRaster(state: SpriteState, frame: 0 | 1): { columns: number; rows: number; cells: string } {
  const key = `${state}:${frame}`
  const hit = rasterCache.get(key)

  if (hit) {
    return hit
  }

  const { columns, rows, cells } = rasterCells(buildFrame(frame, state))
  const made = { columns, rows, cells: encodeCells(cells) }
  rasterCache.set(key, made)

  return made
}

// --- desktop: SVG layer -----------------------------------------------------

export const SPRITE_CSS = `.lg0{animation:l0 1s steps(1) infinite}.lg1{animation:l1 1s steps(1) infinite}
@keyframes l0{0%{opacity:1}50%{opacity:0}}@keyframes l1{0%{opacity:0}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.lg0,.lg1{animation:none}.lg1{opacity:0}}`

const rect = (x: number, y: number, size: number, key: Key): string =>
  `<rect${key === 'b' ? ' class="bone"' : ''} x="${x * size}" y="${y * size}" width="${size}" height="${size}" fill="${PALETTE[key]}"/>`

function layer(grid: Grid, size: number, from: number, to: number): string {
  let out = ''

  for (let y = from; y < to; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const key = grid[y]![x]!

      if (key !== '.') {
        out += rect(x, y, size, key)
      }
    }
  }

  return out
}

// A soft ink halo behind the bone pixels: one group opacity, so adjacent rects merge into one silhouette.
function haloLayer(grid: Grid, size: number): string {
  const pad = size / 4
  let rects = ''

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (grid[y]![x] === 'b') {
        rects += `<rect x="${x * size - pad}" y="${y * size - pad}" width="${size + 2 * pad}" height="${size + 2 * pad}"/>`
      }
    }
  }

  return `<g opacity="0.45" fill="${PALETTE.k}">${rects}</g>`
}

export function spriteGroup(size: number, state: SpriteState, ox: number, oy: number): string {
  const f0 = buildFrame(0, state)
  const open = `<g transform="translate(${ox},${oy})" shape-rendering="crispEdges">${haloLayer(f0, size)}`
  const body = layer(f0, size, 0, LEG_ROW)
  const legs0 = layer(f0, size, LEG_ROW, HEIGHT)

  if (state !== 'running') {
    return `${open}${body}${legs0}</g>`
  }

  const legs1 = layer(buildFrame(1, state), size, LEG_ROW, HEIGHT)

  return `${open}${body}<g class="lg0">${legs0}</g><g class="lg1" opacity="0">${legs1}</g></g>`
}
