// Clawd's look (the mascot's frames, faces, confetti) and the finale, drawn by
// plugin.tsx: the band, and the mascot on opencode's progress line. Pure:
// everything here is a function of the tick and the width.
import { blank, frame, mod, noise, put, textWidth } from './cells'
import type { Grid, Style } from './cells'
import type { Muse } from './muse'
import { finale } from './finale'
import { SHOW_ROWS, showScene } from './show'
import type { Stage } from './show'

export * from './cells'

export type Pose = 'think' | 'tool' | 'say' | 'wait'
/** What the turn is doing, as the band's companion tells it. */
export type Act = 'think' | 'tool' | 'ask' | 'say' | 'wait'
export type Finale = 'answer' | 'aborted' | 'error'
/** The companion's mood between turns. */
export type Mood = 'hello' | 'ready' | 'aborted' | 'error' | 'sleep'

export type Theme = {
  name: string
  /** The mascot's color, and a second one for its props. */
  color: string
  accent: string
  /** Frames of the mascot beside the progress line, by what the turn is doing. */
  sprite: Record<Pose, string[]>
  happy: string
  sad: string
  dead: string
  sleep: string
  /** Particles of the finale's burst, and their colors. */
  confetti: string[]
  palette: string[]
  /** Rows the scene takes in the band. */
  rows: number
  /**
   * The band's scene while a turn runs: `rows` rows of `w` cells. `tool`
   * (`shell: npm test`) lets it act out the tool, `muse` is what a model wrote
   * for it (muse.ts), `seed` makes each turn its own, and `stage` is the work
   * the show plays for (show.ts, `nextStage`).
   */
  scene: (t: number, w: number, act: Act, tool?: string, muse?: Muse, seed?: number, stage?: Stage) => Grid
}

/** Milliseconds per frame: the mascot's, the band's. */
export const SPRITE_MS = 140
export const STAGE_MS = 100
/** How long the finale stays after a turn ends. */
export const FINALE_MS = 4000

export function poseOf(mode: string): Pose {
  if (mode === 'thinking' || mode === 'think') return 'think'
  if (mode === 'tool-use' || mode === 'tool-input' || mode === 'tool') return 'tool'
  if (mode === 'responding' || mode === 'say') return 'say'
  return 'wait'
}

const CLAUDE = '#d77757'

export const THEME: Theme = {
  name: 'clawd',
  rows: SHOW_ROWS,
  color: CLAUDE,
  accent: '#e9b49a',
  sprite: {
    think: ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'].map(s => `▐▛█▜▌ ${s}`),
    tool: ['▐▛█▜▌▭▭', '▐▛█▜▌▬▭', '▐▛█▜▌▭▬'],
    say: ['▐▛█▜▌ ✎  ', '▐▛█▜▌ ✎· ', '▐▛█▜▌ ✎··'],
    wait: ['▐▛█▜▌ .  ', '▐▛█▜▌ .. ', '▐▛█▜▌ ...'],
  },
  happy: '▐▛█▜▌ ✻',
  sad: '▐▀█▀▌',
  dead: '▐x█x▌',
  sleep: '▐▄█▄▌ zZ',
  confetti: ['✻', '✶', '✳', '·', '✢'],
  palette: [CLAUDE, '#e9b49a', '#f5e6d3', '#c15f3c'],
  scene: showScene,
}

// ---- finale --------------------------------------------------------------

/** After a turn: a pixel finale (finale.ts), a different one each time, picked by `id`. */
export function finaleScene(kind: Finale, label: string, t: number, w: number, id = ''): Grid {
  return finale(kind, label, t, w, id)
}
