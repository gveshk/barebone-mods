import { describe, expect, test } from 'claude-code/testing'

import { LANE_COLORS, hash, laneColor, laneOf } from '../hooks/lanes'

describe('lanes', () => {
  test('hash and color are stable', () => {
    expect(hash('a')).toBe(177604)
    expect(laneColor('a')).toBe('#7dcfff')
    expect(laneColor('Explore')).toBe(laneColor('Explore'))
    expect(LANE_COLORS.includes(laneColor('anything') as (typeof LANE_COLORS)[number])).toBe(true)
  })

  test('no lane color is close to the failure red', () => {
    expect(LANE_COLORS.length).toBe(6)
    expect(LANE_COLORS[5]).toBe('#ff9bd2')
    expect(LANE_COLORS.includes('#f7768e' as never)).toBe(false)
  })

  test('different lanes spread over more than one color', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(laneColor))
    expect(colors.size > 1).toBe(true)
  })

  test('laneOf', () => {
    expect(laneOf('Explore')).toBe('Explore')
    expect(laneOf('my-plugin:researcher')).toBe('researcher')
    expect(laneOf('x', 'builder')).toBe('builder')
    expect(laneOf('', undefined)).toBe('agent')
    expect(laneOf('  ', '  ')).toBe('agent')
  })

  test('laneOf cleans escapes and tolerates a missing type', () => {
    expect(laneOf('x\u001b[31mred\u001b[0m')).toBe('xred')
    expect(laneOf(undefined as unknown as string)).toBe('agent')
    expect(laneOf('Explore\u0000')).toBe('Explore')
  })
})
