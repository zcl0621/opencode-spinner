// Clawd's look (the mascot's frames, faces, confetti) and the finale, drawn by
// plugin.tsx: the band, and the mascot on opencode's progress line. Pure:
// everything here is a function of the tick and the width.
import { blank, frame, mod, noise, put, textWidth } from './cells'
import type { Grid, Style } from './cells'
import type { Muse } from './muse'
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
export const FINALE_MS = 3000

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

/** After a turn: a burst of confetti around the mascot and the label. */
export function finaleScene(kind: Finale, label: string, t: number, w: number, theme: Theme = THEME): Grid {
  const rows = theme.rows
  const g = blank(w, rows)
  const face = kind === 'answer' ? theme.happy : kind === 'aborted' ? theme.sad : theme.dead
  const text = `${face}  ${label}`
  const tw = textWidth(text)
  const cx = Math.floor(w / 2)
  const left = Math.max(0, cx - Math.floor(tw / 2))
  const mid = Math.floor(rows / 2)

  if (kind === 'answer') {
    const count = Math.min((40 * rows) / 2, Math.max(12, Math.floor(((w / 3) * rows) / 2)))
    for (let i = 0; i < count; i++) {
      const dir = noise(i) < 0.5 ? -1 : 1
      const speed = 0.8 + noise(i + 9) * 2.2
      const reach = Math.min(t, 18) * speed
      const x = cx + dir * (tw / 2 + reach + noise(i + 4) * 3)
      const y = Math.floor(noise(i + 2) * rows)
      const isFading = t > 18 + noise(i + 6) * 8
      put(g, x, y, frame(theme.confetti, i + (t >> 2)), { c: frame(theme.palette, i), d: isFading })
    }
  } else if (kind === 'aborted') {
    for (let x = 0; x < w; x += 4) put(g, mod(x + (t >> 1), w), mod(x, rows), '·', { c: '#6c757d', d: true })
  } else {
    for (let x = 0; x < w; x++) if (noise(x + t) < 0.08) put(g, x, mod(x, rows), frame(['▚', '▞', '░'], x + t), { c: '#e63946', d: true })
  }

  const style: Style = kind === 'answer' ? { c: theme.color, b: true } : kind === 'aborted' ? { c: '#adb5bd' } : { c: '#e63946', b: true }
  const flicker = kind === 'error' && mod(t, 6) === 0
  put(g, left - 1, mid, ' '.repeat(tw + 2))
  if (!flicker) put(g, left, mid, text, style)
  return g
}
