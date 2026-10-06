export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }

// USD per million tokens. ESTIMATES for display, not a bill. Source: the claude-api
// reference's model table cached 2026-09-25 for input and output of: Fable 5/5.1 and
// Mythos 5/5.1 (10/50), Opus 5.5 (4/20), Opus 5, 4.8, 4.7, 4.6 (5/25), Sonnet 5.5, 5 (2/10),
// Sonnet 4.6 (3/15), Haiku 4.5 (1/5); its stated cache reads for Fable 5.1 (0.25), Fable 5 and
// Mythos 5 (1.0), Opus 5.5 (0.20) and Sonnet 5.5 (0.20). Everything else is DERIVED: cache read
// = 0.1x input, cache write = 1.25x input (5-minute TTL; 1-hour writes cost more and are not
// modelled). The 5.1 row comes first so it wins over the broader Fable/Mythos row.
// A model that matches no row falls back to FALLBACK (an Opus-tier guess), never to a
// neighbouring family's price.
const TABLE: Array<[RegExp, Price]> = [
  [/fable-5-1|mythos-5-1/i, { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }],
  [/fable|mythos/i, { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 }],
  [/opus-5-5/i, { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  [/opus-(5|4-[678])(?!\d)/i, { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  [/sonnet-4-6/i, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }],
  [/sonnet-5/i, { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  [/haiku-4-5/i, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
]

export const FALLBACK: Price = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }

export const isKnownModel = (model: string): boolean => TABLE.some(([pattern]) => pattern.test(model))

export const priceOf = (model: string): Price => TABLE.find(([pattern]) => pattern.test(model))?.[1] ?? FALLBACK

export const costOf = (model: string, usage: Usage): number => {
  const price = priceOf(model)

  return (
    ((usage.input_tokens || 0) * price.input +
      (usage.output_tokens || 0) * price.output +
      (usage.cache_read_input_tokens || 0) * price.cacheRead +
      (usage.cache_creation_input_tokens || 0) * price.cacheWrite) /
    1e6
  )
}

// Context windows from the same reference table: 1M for the Fable/Mythos, Opus 5.x/4.6-4.8,
// Sonnet 5.x/4.6 rows, 200K for Haiku 4.5. Any other id has no known window.
const WINDOWS: Array<[RegExp, number]> = [
  [/haiku-4-5/i, 200_000],
  [/fable|mythos|opus-5|opus-4-[678](?!\d)|sonnet-5|sonnet-4-6/i, 1_000_000],
]

export const windowOf = (model: string): number | undefined => WINDOWS.find(([pattern]) => pattern.test(model))?.[1]
