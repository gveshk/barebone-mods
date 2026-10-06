import { describe, expect, test } from 'claude-code/testing'

import { bar, clean, duration, modelName, percent, short, usd } from '../hooks/format'

describe('format', () => {
  test('short', () => {
    expect(short(999)).toBe('999')
    expect(short(1500)).toBe('1.5k')
    expect(short(134_400)).toBe('134.4k')
    expect(short(1_200_000)).toBe('1.2M')
  })

  test('duration', () => {
    expect(duration(0)).toBe('00:00')
    expect(duration(65_000)).toBe('01:05')
    expect(duration(3_725_000)).toBe('1:02:05')
    expect(duration(-5)).toBe('00:00')
  })

  test('usd', () => {
    expect(usd(0)).toBe('$0.00')
    expect(usd(0.004)).toBe('<$0.01')
    expect(usd(2.414)).toBe('$2.41')
  })

  test('modelName', () => {
    expect(modelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-opus-5')).toBe('Opus 5')
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('sonnet')).toBe('Sonnet')
    expect(modelName('gpt-x')).toBe('gpt-x')
  })

  test('percent and bar', () => {
    expect(percent(50, 200)).toBe(25)
    expect(percent(1, 0)).toBe(0)
    expect(bar(0.5, 10)).toBe('█████░░░░░')
    expect(bar(2, 4)).toBe('████')
    expect(bar(Number.NaN, 4)).toBe('░░░░')
  })

  test('clean strips control characters, escapes and extra spaces, then truncates', () => {
    expect(clean('a\u0000b\u202Ec', 10)).toBe('abc')
    expect(clean('\u001b[31mred\u001b[0m', 10)).toBe('red')
    expect(clean('  a   b ', 10)).toBe('a b')
    expect(clean('x'.repeat(100), 5)).toBe('xxxx…')
  })

  test('short, duration, usd and percent stay sane on bad numbers', () => {
    expect(short(999_999)).toBe('1M')
    expect(short(999_949)).toBe('999.9k')
    expect(short(Number.NaN)).toBe('0')
    expect(short(0)).toBe('0')
    expect(duration(Number.NaN)).toBe('00:00')
    expect(usd(Number.NaN)).toBe('$0.00')
    expect(usd(Number.POSITIVE_INFINITY)).toBe('$0.00')
    expect(usd(-1)).toBe('$0.00')
    expect(percent(30, 10)).toBe(100)
    expect(percent(Number.NaN, 10)).toBe(0)
  })

  test('modelName ignores date suffixes and old-style ids', () => {
    expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
    expect(modelName('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet-20241022')
  })

  test('bar copes with odd widths', () => {
    expect(bar(0.5, -1)).toBe('')
    expect(bar(0.5, Number.POSITIVE_INFINITY)).toBe('')
    expect(bar(1, 4.5)).toBe('████')
  })

  test('clean handles tiny limits, inner control characters, code points and does not XML-escape', () => {
    expect(clean('abcdef', 0)).toBe('')
    expect(clean('abcdef', -3)).toBe('')
    expect(clean('abcdef', Number.NaN)).toBe('')
    expect(clean('abcdef', 1)).toBe('…')
    expect(clean('a \u0000 b', 9)).toBe('a b')
    expect(clean('abc def', 5)).toBe('abc…')
    expect(clean('😀😀😀😀', 3)).toBe('😀😀…')
    expect(clean('</text><b>&"\'', 40)).toBe('</text><b>&"\'')
  })
})
