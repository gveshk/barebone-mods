import { clean } from './format'

// Accent colors for lanes. None is the mascot's coral, so a lane never looks like the crab.
export const LANE_COLORS = ['#7aa2f7', '#e0af68', '#9ece6a', '#bb9af7', '#7dcfff', '#ff9bd2'] as const

export const hash = (text: string): number => {
  let h = 5381

  for (const char of text) {
    h = ((h * 33) ^ char.codePointAt(0)!) >>> 0
  }

  return h
}

export const FAILED = '#e5484d'

export const laneColor = (lane: string): string => LANE_COLORS[hash(lane) % LANE_COLORS.length]!

// A lane is the name a skill reported, else the agent type without its plugin prefix.
// Both come from model or plugin text, so they are cleaned (terminal-safe) here.
export const laneOf = (type: string, reported?: string): string => {
  const raw = clean(reported ?? '', 40) || clean(type ?? '', 40)
  const bare = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1).trim() : raw

  return bare === '' ? 'agent' : bare
}
