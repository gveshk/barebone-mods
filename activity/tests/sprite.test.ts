import { describe, expect, test } from 'claude-code/testing'

import { HEIGHT, PALETTE, SPRITE_CSS, WIDTH, base64, buildFrame, encodeCells, rasterCells, spriteGroup, spriteRaster } from '../hooks/sprite'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function decode(b64: string): number[] {
  const bytes: number[] = []
  const clean = b64.replace(/=+$/, '')
  let bits = 0
  let acc = 0

  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch)
    bits += 6

    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 255)
    }
  }

  const words: number[] = []

  for (let i = 0; i + 3 < bytes.length; i += 4) {
    words.push((bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0)
  }

  return words
}

describe('sprite grid', () => {
  test('dimensions', () => {
    const g = buildFrame(0)
    expect(g.length).toBe(HEIGHT)
    expect(g.every(row => row.length === WIDTH)).toBe(true)
  })

  test('key pixels of the running crab', () => {
    const g = buildFrame(0)
    expect(g[6]![5]).toBe('w') // left eye glint
    expect(g[7]![5]).toBe('k') // left eye
    expect(g[6]![10]).toBe('w') // right eye glint
    expect(g[2]![10]).toBe('k') // skull socket
    expect(g[2]![12]).toBe('k') // skull socket
    expect(g[9]![7]).toBe('k') // smile corner
    expect(g[10]![8]).toBe('k') // smile bottom
    expect(g[1]![10]).toBe('b') // skull top
  })

  test('frames differ only in the leg rows', () => {
    const a = buildFrame(0)
    const b = buildFrame(1)
    expect(a.slice(0, 12)).toEqual(b.slice(0, 12))
    expect(a[12]).not.toEqual(b[12])
    expect([a[12]![4], a[12]![5]]).toEqual(['s', '.'])
    expect([b[12]![4], b[12]![5]]).toEqual(['.', 's'])
  })

  test('failed state frowns and loses the eye glints', () => {
    const g = buildFrame(0, 'failed')
    expect(g[9]![8]).toBe('k')
    expect(g[10]![7]).toBe('k')
    expect(g[10]![8]).toBe('o')
    expect(g[6]![5]).toBe('k')
  })
})

describe('raster', () => {
  test('base64 encodes with padding', () => {
    expect(base64([77, 97, 110])).toBe('TWFu')
    expect(base64([77, 97])).toBe('TWE=')
    expect(base64([77])).toBe('TQ==')
    expect(base64([255, 254])).toBe('//4=')
  })

  test('encodeCells matches the documented example', () => {
    expect(encodeCells([0x2588, 0xff8800, 0x01000000])).toBe('iCUAAACI/wAAAAAB')
    expect(encodeCells([0xff000000])).toBe('AAAA/w==')
  })

  test('spriteRaster round-trips to the raw cells', () => {
    const cases: Array<['running' | 'done' | 'failed', 0 | 1]> = [['running', 0], ['running', 1], ['failed', 0], ['done', 0]]

    for (const [state, frame] of cases) {
      expect(decode(spriteRaster(state, frame).cells)).toEqual(rasterCells(buildFrame(frame, state)).cells)
    }
  })

  test('last raster row covers the legs', () => {
    const { cells } = rasterCells(buildFrame(0))
    const at = (r: number, x: number) => cells.slice((r * 17 + x) * 3, (r * 17 + x) * 3 + 3)
    expect(at(6, 4)).toEqual([0x2580, 0xd9694a, 0xd9694a])
    expect(at(6, 5)).toEqual([0x20, 0x01000000, 0x01000000])
    const other = rasterCells(buildFrame(1)).cells
    expect(other.slice(0, 17 * 6 * 3)).toEqual(cells.slice(0, 17 * 6 * 3))
    expect(other.slice(17 * 6 * 3)).not.toEqual(cells.slice(17 * 6 * 3))
  })

  test('failed raster has no glint', () => {
    const { cells } = rasterCells(buildFrame(0, 'failed'))
    expect(cells.slice((3 * 17 + 5) * 3, (3 * 17 + 5) * 3 + 3)).toEqual([0x2580, 0x2b2320, 0x2b2320])
  })

  test('cells pick half blocks from pixel pairs', () => {
    const { columns, rows, cells } = rasterCells(buildFrame(0))
    expect(columns).toBe(17)
    expect(rows).toBe(7)
    expect(cells.length).toBe(17 * 7 * 3)
    const at = (r: number, x: number) => cells.slice((r * 17 + x) * 3, (r * 17 + x) * 3 + 3)
    expect(at(0, 0)).toEqual([0x20, 0x01000000, 0x01000000]) // empty
    expect(at(0, 10)).toEqual([0x2584, 0xf2ede4, 0x01000000]) // bone below, nothing above
    expect(at(3, 5)).toEqual([0x2580, 0xffffff, 0x2b2320]) // glint over eye
  })

  test('spriteRaster yields a string the engine accepts', () => {
    const r = spriteRaster('running', 0)
    expect(r.columns).toBe(17)
    expect(r.rows).toBe(7)
    expect(r.cells.length).toBe(1904)
  })
})

describe('svg layer', () => {
  test('running sprite has two animated leg layers and bone classes', () => {
    const svg = spriteGroup(5, 'running', 8, 4)
    expect(svg.includes('translate(8,4)')).toBe(true)
    expect(svg.includes('class="lg0"')).toBe(true)
    expect(svg.includes('class="lg1"')).toBe(true)
    expect(svg.split('class="bone"').length - 1).toBe(11)
    expect(svg.includes(PALETTE.o)).toBe(true)
  })

  test('crisp edges, hidden second leg layer and a halo drawn first', () => {
    const svg = spriteGroup(5, 'running', 0, 0)
    expect(svg.includes('shape-rendering="crispEdges"')).toBe(true)
    expect(svg.includes('class="lg1" opacity="0"')).toBe(true)
    const start = svg.indexOf('<g opacity="0.45"')
    const halo = svg.slice(start, svg.indexOf('</g>', start))
    expect(halo.split('<rect').length - 1).toBe(11)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(start < svg.indexOf('class="bone"')).toBe(true)
  })

  test('no stroke in the stylesheet', () => {
    expect(SPRITE_CSS.includes('stroke')).toBe(false)
  })

  test('done sprite is still', () => {
    const svg = spriteGroup(5, 'done', 0, 0)
    expect(svg.includes('lg1')).toBe(false)
    expect(svg.includes('lg0')).toBe(false)
    const start = svg.indexOf('<g opacity="0.45"')
    expect(svg.slice(start, svg.indexOf('</g>', start)).split('<rect').length - 1).toBe(11)
  })
})

describe('spriteRaster cache', () => {
  test('returns the same object for the same state and frame', () => {
    const a = spriteRaster('running', 0)
    expect(spriteRaster('running', 0)).toBe(a)
    expect(spriteRaster('running', 1)).not.toBe(a)
    expect(decode(a.cells)).toEqual(rasterCells(buildFrame(0, 'running')).cells)
  })
})
