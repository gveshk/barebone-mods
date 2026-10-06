import { describe, expect, test } from 'claude-code/testing'

import { FALLBACK, costOf, isKnownModel, priceOf, windowOf } from '../hooks/prices'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
const usage = (over: Partial<Record<string, number>> = {}) => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  ...over,
})

describe('prices', () => {
  test('costOf per model', () => {
    expect(close(costOf('claude-sonnet-5-5', usage({ input_tokens: 1e6, output_tokens: 1e6 })), 12)).toBe(true)
    expect(close(costOf('claude-fable-5-1', usage({ input_tokens: 1e6, output_tokens: 1e6 })), 60)).toBe(true)
    expect(close(costOf('claude-haiku-4-5-20251001', usage({ input_tokens: 1e6, output_tokens: 1e6 })), 6)).toBe(true)
    expect(close(costOf('claude-sonnet-4-6', usage({ input_tokens: 1e6, output_tokens: 1e6 })), 18)).toBe(true)
    expect(close(costOf('claude-opus-5-5', usage({ cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 })), 5.2)).toBe(true)
  })

  test('cache reads: Fable 5 and Mythos 5 are $1/MTok, only the 5.1 releases are $0.25', () => {
    const read = (model: string) => costOf(model, usage({ cache_read_input_tokens: 1e6 }))

    expect(close(read('claude-fable-5'), 1)).toBe(true)
    expect(close(read('claude-mythos-5'), 1)).toBe(true)
    expect(close(read('claude-fable-5-1'), 0.25)).toBe(true)
    expect(close(read('claude-mythos-5-1'), 0.25)).toBe(true)
  })

  test('priceOf picks rows and falls back', () => {
    expect(priceOf('claude-opus-4-8').input).toBe(5)
    expect(priceOf('claude-opus-5-5').input).toBe(4)
    expect(priceOf('mystery-model')).toEqual(FALLBACK)
  })

  test('windowOf is only known for known models', () => {
    expect(windowOf('claude-haiku-4-5')).toBe(200_000)
    expect(windowOf('claude-opus-5-5')).toBe(1_000_000)
    expect(windowOf('mystery-model')).toBeUndefined()
  })

  test('unlisted models fall back instead of borrowing a neighbour price', () => {
    expect(priceOf('claude-3-5-sonnet-20241022')).toEqual(FALLBACK)
    expect(priceOf('claude-opus-4-1')).toEqual(FALLBACK)
    expect(priceOf('claude-sonnet-4-6').input).toBe(3)
    expect(priceOf('claude-sonnet-5-5').input).toBe(2)
    expect(priceOf('claude-opus-5').input).toBe(5)
    expect(priceOf('claude-haiku-4-5-20251001').input).toBe(1)
  })

  test('windowOf follows the table rows', () => {
    expect(windowOf('claude-opus-4-1')).toBeUndefined()
    expect(windowOf('claude-sonnet-4-5')).toBeUndefined()
    expect(windowOf('claude-haiku-5')).toBeUndefined()
    expect(windowOf('claude-opus-4-8')).toBe(1_000_000)
    expect(windowOf('claude-sonnet-4-6')).toBe(1_000_000)
    expect(windowOf('claude-fable-5-1')).toBe(1_000_000)
  })

  test('isKnownModel and partial usage', () => {
    expect(isKnownModel('claude-opus-5-5')).toBe(true)
    expect(isKnownModel('mystery-model')).toBe(false)
    expect(close(costOf('claude-sonnet-5-5', { input_tokens: 1e6 } as never), 2)).toBe(true)
  })
})
