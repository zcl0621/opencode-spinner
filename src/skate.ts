// The skatepark (one of the show's two places, show.ts), six rows (12 px) tall. The camera rides along
// with him past a park laid out at random: funbox pyramids, rails, stair sets
// (gapped, or a handrail down them), drop-in decks, kickers and manual pads.
// At each one he throws a random trick (kickflips, tre flips, grinds,
// manuals…), its name and score popping up like in a skate game. Hard tricks
// sometimes end in a bail.
import { canvas, cells, draw, mod, noise, plot, put } from './cells'
import type { Canvas, Grid } from './cells'
import type { Muse } from './muse'
import { glyphStars } from './scenes'
import type { Act } from './themes'

export const SKATE_ROWS = 6
/** The ground's top pixel row; wheels on the ground sit one above it. */
const GROUND = 11
/** The highest the wheels may go, so his head stays in frame. */
const MAX_H = 5
/** World pixels between the starts of two obstacles, and the flat run-up before each. */
const SLOT = 46
const RUN_UP = 14

// ---- art ----------------------------------------------------------------------

const BODY_COLORS = { O: '#d77757', L: '#eb9b80', D: '#b05d42', E: '#2b1d18' }
type Pose = 'ride' | 'crouch' | 'air' | 'grab' | 'grind'
/** Mini Clawd, 8 px wide and 4 tall, standing on the board below him. */
const BODY: Record<Pose, readonly string[]> = {
  ride: ['.LOOOOO.', '.OEOOEO.', 'OOOOOOOO', '..D..D..'],
  crouch: ['........', '.LOOOOO.', 'OOEOOEOO', '.DD..DD.'],
  air: ['O.LOOO.O', '.OEOOEO.', '.OOOOOO.', '..D..D..'],
  grab: ['.LOOOOO.', '.OEOOEO.', 'OOOOOOO.', 'O.D..D..'],
  grind: ['.LOOOOO.', 'OOEOOEOO', '.OOOOOO.', '..D..D..'],
}
const BAIL_BODY = ['.LOOOOO.', 'OEOOEOOD']

/**
 * The board seen from the side, two rows under his feet. A flip turns it
 * about its long axis (edge, face, upside down, face); a shove-it turns it end on.
 */
const BOARD = {
  flat: ['KKKKKK', '.Y..Y.'],
  under: ['.Y..Y.', 'PPPPPP'],
  grip: ['GGGGGG', 'GGGGGG'],
  graphic: ['PSPPSP', 'PPSPPS'],
  end: ['..KK..', '..YY..'],
  tail: ['...KKK', 'KKK.Y.'],
  nose: ['KKK...', '.Y.KKK'],
} as const
type Board = keyof typeof BOARD
const BOARD_COLORS = { K: '#c8a26b', Y: '#ffd166', P: '#f7768e', S: '#ffd166', G: '#6b7089' }

// ---- tricks -------------------------------------------------------------------

type Trick = { name: string; points: number; frames: readonly Board[]; grab?: boolean }

const FLIPS: readonly Trick[] = [
  { name: 'kickflip', points: 500, frames: ['flat', 'grip', 'under', 'graphic', 'flat'] },
  { name: 'heelflip', points: 500, frames: ['flat', 'graphic', 'under', 'grip', 'flat'] },
  { name: '360 flip', points: 1000, frames: ['flat', 'end', 'grip', 'under', 'end', 'graphic', 'flat'] },
  { name: 'varial flip', points: 700, frames: ['flat', 'end', 'under', 'end', 'flat'] },
  { name: 'hardflip', points: 900, frames: ['flat', 'grip', 'end', 'under', 'graphic', 'flat'] },
  { name: 'laser flip', points: 1200, frames: ['flat', 'graphic', 'end', 'under', 'grip', 'end', 'flat'] },
  { name: 'double kickflip', points: 1500, frames: ['flat', 'grip', 'under', 'graphic', 'flat', 'grip', 'under', 'graphic', 'flat'] },
]
const MELLOW: readonly Trick[] = [
  { name: 'ollie', points: 100, frames: ['flat'] },
  { name: 'pop shove-it', points: 300, frames: ['flat', 'end', 'flat'] },
  { name: 'melon grab', points: 400, frames: ['flat'], grab: true },
  { name: 'indy grab', points: 400, frames: ['flat'], grab: true },
]
const GRINDS: readonly { name: string; points: number; board: Board }[] = [
  { name: '50-50', points: 300, board: 'flat' },
  { name: '5-0', points: 400, board: 'tail' },
  { name: 'boardslide', points: 500, board: 'end' },
  { name: 'nosegrind', points: 500, board: 'nose' },
  { name: 'crooked grind', points: 700, board: 'nose' },
  { name: 'smith grind', points: 800, board: 'tail' },
  { name: 'feeble grind', points: 800, board: 'tail' },
]

/** The tricks that fit the turn: flips while a tool runs, mellow ones while he thinks. */
function trickPool(act: Act): readonly Trick[] {
  if (act === 'tool') return [...FLIPS, ...MELLOW.slice(1)]
  if (act === 'think' || act === 'wait') return MELLOW
  return [...MELLOW, ...FLIPS.slice(0, 2)]
}

// ---- the park -----------------------------------------------------------------

export type Kind = 'pyramid' | 'rail' | 'stairs' | 'handrail' | 'drop' | 'kicker' | 'manual'

/** Where he is on an obstacle: wheel height, board, pose, and what the crowd sees. */
type Ride = {
  h: number
  board: Board
  pose: Pose
  label?: string
  points?: number
  sparks?: boolean
  /** Ticks into a bail, or undefined. */
  bail?: number
}

type Obstacle = {
  kind: Kind
  len: number
  /** Surface height (px above the ground) at `dx` columns in; 0 off it. */
  surface: (dx: number) => number
  /** A rail's height at `dx`, where there is one. */
  rail?: (dx: number) => number | null
  /** His ride at `dx` (may start before 0 and end after len); null: plain rolling. */
  ride: (dx: number) => Ride | null
}

const BAIL_LEN = 14

/** A parabola from (x0, h0) to (x1, h1) peaking at `apex` halfway; null outside it. */
function arc(dx: number, x0: number, h0: number, x1: number, h1: number, apex: number): { h: number; p: number } | null {
  if (dx < x0 || dx > x1) return null
  const p = (dx - x0) / (x1 - x0)
  return { h: h0 + (h1 - h0) * p + 4 * (apex - (h0 + h1) / 2) * p * (1 - p), p }
}

/** A trick through the air from (x0, h0) to (x1, h1); a crouch just before the pop, maybe a bail after. */
function air(dx: number, x0: number, h0: number, x1: number, h1: number, apex: number, trick: Trick, isBail: boolean, after: (dx: number) => number): Ride | null {
  if (dx >= x0 - 2 && dx < x0) return { h: after(dx), board: 'flat', pose: 'crouch' }
  const a = arc(dx, x0, h0, x1, h1, Math.min(MAX_H, apex))
  if (a) {
    const frames = trick.frames
    const board = frames[Math.min(frames.length - 1, Math.floor(a.p * frames.length))]!
    return { h: a.h, board, pose: trick.grab && a.p > 0.2 && a.p < 0.8 ? 'grab' : a.p < 0.12 ? 'crouch' : 'air', label: trick.name, points: trick.points }
  }
  if (isBail && dx > x1 && dx <= x1 + BAIL_LEN) return { h: 0, board: 'flat', pose: 'ride', label: 'bail!', bail: dx - x1 }
  if (dx > x1 && dx <= x1 + 6) return { h: after(dx), board: 'flat', pose: 'crouch', label: trick.name, points: trick.points }
  return null
}

/** A slope from (x0, h0) to (x1, h1), for drawing and riding. */
const lerp = (dx: number, x0: number, h0: number, x1: number, h1: number) => h0 + ((h1 - h0) * (dx - x0)) / (x1 - x0)

/** The obstacle in slot `i`, with its trick for this act. */
export function obstacleAt(i: number, act: Act, muse?: Muse): Obstacle {
  const kinds: readonly Kind[] = ['pyramid', 'rail', 'stairs', 'handrail', 'kicker', 'manual']
  // Every fourth slot is a drop-in deck: the park's way down.
  const kind: Kind = mod(i, 4) === 0 ? 'drop' : kinds[Math.floor(noise(i * 7 + 1) * kinds.length)]!
  const pool = trickPool(act)
  let trick = pool[Math.floor(noise(i * 31 + 7) * pool.length)]!
  let grind = GRINDS[Math.floor(noise(i * 17 + 3) * GRINDS.length)]!
  let manual: { name: string; points: number; board: Board } | null = null
  // Tricks the muse wrote take most obstacles they fit.
  if (muse && noise(i * 41 + 9) < 0.75) {
    const pick = <T,>(list: readonly T[], seed: number) => (list.length ? list[Math.floor(noise(seed) * list.length)]! : null)
    const air = pick(muse.tricks.filter(t => t.kind === 'flip' || t.kind === 'grab'), i * 43 + 1)
    if (air) trick = { name: air.name, points: air.points, frames: air.frames, grab: air.kind === 'grab' }
    const rail = pick(muse.tricks.filter(t => t.kind === 'grind'), i * 47 + 2)
    if (rail) grind = { name: rail.name, points: rail.points, board: rail.frames[0]! }
    const pad = pick(muse.tricks.filter(t => t.kind === 'manual'), i * 53 + 3)
    if (pad) manual = { name: pad.name, points: pad.points, board: pad.frames[0]! }
  }
  const isBail = trick.points >= 700 && noise(i * 53 + 5) < 0.2

  switch (kind) {
    case 'pyramid': {
      const surface = (dx: number) => (dx >= 1 && dx <= 3 ? dx : dx >= 4 && dx <= 13 ? 3 : dx >= 14 && dx <= 16 ? 17 - dx : 0)
      return { kind, len: 18, surface, ride: dx => air(dx, 3, 3, 15, 2, 6, trick, isBail, surface) }
    }
    case 'kicker': {
      const surface = (dx: number) => (dx === 1 ? 1 : dx === 2 || dx === 3 ? 2 : 0)
      return { kind, len: 5, surface, ride: dx => air(dx, 3, 2, 17, 0, 6, trick, isBail, surface) }
    }
    case 'manual': {
      const surface = (dx: number) => (dx >= 0 && dx < 14 ? 1 : 0)
      const nose = noise(i * 11) < 0.4
      const m = manual ?? (nose ? { name: 'nose manual', points: 400, board: 'nose' as const } : { name: 'manual', points: 300, board: 'tail' as const })
      return {
        kind,
        len: 14,
        surface,
        ride: dx => {
          const up = arc(dx, -3, 0, 0, 1, 2)
          if (up) return { h: up.h, board: 'flat', pose: 'air' }
          if (dx >= 0 && dx < 13) return { h: 1, board: m.board, pose: 'grind', label: m.name, points: m.points }
          const down = arc(dx, 13, 1, 17, 0, 2)
          return down ? { h: down.h, board: 'flat', pose: 'air', label: m.name, points: m.points } : null
        },
      }
    }
    case 'rail': {
      const out = MELLOW[Math.floor(noise(i * 13) * 2)]!
      return {
        kind,
        len: 16,
        surface: () => 0,
        rail: dx => (dx >= 1 && dx <= 14 ? 3 : null),
        ride: dx => {
          if (dx >= -5 && dx < -3) return { h: 0, board: 'flat', pose: 'crouch' }
          const on = arc(dx, -3, 0, 1, 3, 4)
          if (on) return { h: on.h, board: 'flat', pose: 'air' }
          if (dx > 1 && dx < 13) return { h: 3, board: grind.board, pose: 'grind', label: grind.name, points: grind.points, sparks: true }
          const off = arc(dx, 13, 3, 19, 0, 4)
          if (off) return { h: off.h, board: out.frames[Math.min(out.frames.length - 1, Math.floor(off.p * out.frames.length))]!, pose: 'air', label: grind.name, points: grind.points }
          return null
        },
      }
    }
    case 'stairs':
    case 'handrail': {
      // A bank up to a deck, then three steps down.
      const surface = (dx: number) =>
        dx >= 1 && dx <= 3 ? dx : dx >= 4 && dx <= 9 ? 3 : dx === 10 || dx === 11 ? 2 : dx === 12 || dx === 13 ? 1 : 0
      if (kind === 'stairs') return { kind, len: 14, surface, ride: dx => air(dx, 8, 3, 21, 0, 6, trick, isBail, surface) }
      const railH = (dx: number) => (dx >= 8 && dx <= 15 ? Math.round(lerp(dx, 8, 5, 15, 2)) : null)
      return {
        kind,
        len: 16,
        surface,
        rail: railH,
        ride: dx => {
          if (dx < 6) return dx >= 4 ? { h: 3, board: 'flat', pose: 'crouch' } : null
          const on = arc(dx, 6, 3, 8, 5, 5)
          if (on) return { h: on.h, board: 'flat', pose: 'air' }
          if (dx > 8 && dx < 15) return { h: lerp(dx, 8, 5, 15, 2), board: grind.board, pose: 'grind', label: `handrail ${grind.name}`, points: grind.points * 2, sparks: true }
          const off = arc(dx, 15, 2, 19, 0, 3)
          return off ? { h: off.h, board: 'flat', pose: 'air', label: `handrail ${grind.name}`, points: grind.points * 2 } : null
        },
      }
    }
    case 'drop': {
      // A bank up to a tall deck, its far side a curved drop.
      const CURVE = [4, 3, 2, 1, 1]
      const surface = (dx: number) => (dx >= 1 && dx <= 4 ? dx : dx >= 5 && dx <= 12 ? 4 : dx >= 13 && dx <= 17 ? CURVE[dx - 13]! : 0)
      const isAir = noise(i * 19 + 2) < 0.4
      return {
        kind,
        len: 18,
        surface,
        ride: dx => {
          if (isAir) return air(dx, 12, 4, 23, 0, 6, trick, isBail, surface)
          if (dx >= 12 && dx <= 20) return { h: surface(dx), board: dx < 13 ? 'tail' : 'flat', pose: 'crouch', label: 'drop in', points: 200 }
          return null
        },
      }
    }
  }
}

// ---- drawing ------------------------------------------------------------------

const RAMP = '#414868'
const COPING = '#a9b1d6'
const METAL = '#c0caf5'

function drawObstacle(cv: Canvas, ob: Obstacle, sx: number): void {
  for (let dx = 0; dx < ob.len; dx++) {
    const h = ob.surface(dx)
    for (let k = 0; k < h; k++) plot(cv, sx + dx, GROUND - 1 - k, k === h - 1 ? COPING : RAMP)
    const r = ob.rail?.(dx)
    if (r != null) plot(cv, sx + dx, GROUND - r, METAL)
  }
  // Posts under rails, every few columns.
  if (ob.rail) {
    for (let dx = 0; dx < ob.len; dx++) {
      const r = ob.rail(dx)
      if (r == null || mod(dx, 5) !== 2) continue
      for (let y = GROUND - r + 1; y < GROUND - ob.surface(dx); y++) plot(cv, sx + dx, y, '#787c99')
    }
  }
}

/** Far buildings drifting slowly behind the park, a few windows lit. */
function skyline(cv: Canvas, cam: number): void {
  const off = Math.floor(cam / 4)
  for (let x = 0; x < cv.w; x++) {
    const b = Math.floor((x + off) / 7)
    const h = 3 + Math.floor(noise(b + 40) * 6)
    for (let y = GROUND - h; y < GROUND; y++) {
      const isWindow = mod(x + off, 7) % 2 === 1 && mod(y, 2) === 0 && noise(b * 13 + y) > 0.7
      plot(cv, x, y, isWindow ? '#4a4637' : mod(b, 2) ? '#1a1b26' : '#1f2335')
    }
  }
}

function drawRider(cv: Canvas, sx: number, ride: Ride): void {
  const wheels = Math.round(GROUND - 1 - ride.h)
  draw(cv, sx, wheels - 5, BODY[ride.pose], BODY_COLORS)
  draw(cv, sx + 1, wheels - 1, BOARD[ride.board], BOARD_COLORS)
}

const pad = (n: number) => String(n).padStart(6, '0')

/** Ticks of one run: from a drop-in deck to the next. */
export const RUN_LENGTH = 4 * SLOT

/** The skatepark: `SKATE_ROWS` rows. `salt` picks the park (a different layout per run). */
export function skateScene(t: number, w: number, act: Act, muse?: Muse, salt = 0): Grid {
  // Drop-in decks stay every fourth slot: the park shifts by whole runs.
  const at = (k: number) => obstacleAt(k + salt * 4, act, muse)
  const cv = canvas(w, SKATE_ROWS)
  // He opens on the first drop-in deck.
  const s = t + RUN_UP + 6
  const sx = Math.max(2, Math.min(Math.floor(w * 0.3), w - 10))
  const cam = s - sx
  skyline(cv, cam)
  for (let x = 0; x < w; x++) plot(cv, x, GROUND, mod(x + cam, 12) === 0 ? '#2a2e40' : '#3b3f51')

  const first = Math.floor((cam - RUN_UP - 30) / SLOT)
  for (let i = first; i * SLOT + RUN_UP <= cam + w; i++) drawObstacle(cv, at(i), i * SLOT + RUN_UP - cam)

  // His obstacle: the slot he is in (a ride may run on past it, into the next run-up).
  const i = Math.floor((s - RUN_UP) / SLOT)
  const here = at(i)
  const dx = s - (i * SLOT + RUN_UP)
  const next = at(i + 1)
  const ride = here.ride(dx) ?? next.ride(s - ((i + 1) * SLOT + RUN_UP)) ?? { h: here.surface(dx), board: 'flat' as const, pose: 'ride' as const }

  if (ride.bail !== undefined) {
    // Down: he slides back with the ground, the board rolls on without him.
    draw(cv, sx - ride.bail, GROUND - 2, BAIL_BODY, BODY_COLORS)
    draw(cv, sx + 2 + Math.floor(ride.bail / 2), GROUND - 2, BOARD.flat, BOARD_COLORS)
  } else {
    drawRider(cv, sx, ride)
    // A push now and then on the flat.
    if (ride.pose === 'ride' && ride.h === 0 && mod(t, 16) < 3) plot(cv, sx + 6, GROUND - 1, BODY_COLORS.D)
  }

  const g = cells(cv)
  glyphStars(g, t, Math.floor(w / 6), 0.02, ['·', '✦'], ['#565f89', '#7aa2f7', '#bb9af7'], 11)
  const wheelsRow = Math.floor(Math.round(GROUND - 1 - ride.h) / 2)
  if (ride.sparks) {
    for (let k = 0; k < 2; k++) {
      const cell = g[wheelsRow]?.[sx + 1 + mod(t + k * 3, 6)]
      if (cell && cell.ch === ' ') put(g, sx + 1 + mod(t + k * 3, 6), wheelsRow, k ? '*' : '✦', { c: k ? '#ff9e64' : '#ffd166', b: true })
    }
  }

  // The run's score: tricks landed since the last drop-in deck.
  let score = 0
  for (let k = i - mod(i, 4); k < i; k++) {
    const ob = at(k)
    for (let d = -6; d < ob.len + 24; d += 2) {
      const r = ob.ride(d)
      if (r?.label === 'bail!') {
        score = Math.max(0, score - 500)
        break
      }
      if (r?.points && r.label) {
        score += r.points
        break
      }
    }
  }
  // The trick's name rides to his right, clear of his head at the top of an air.
  const text = !ride.label ? '' : ride.label === 'bail!' ? 'BAIL!' : `${ride.label.toUpperCase()}${ride.points ? ` +${ride.points}` : ''}`
  const labelX = Math.max(0, Math.min(sx + 10, w - text.length))
  const scoreText = `SCORE ${pad(score)}`
  if (w >= 40 && (!text || labelX + text.length + 1 < w - scoreText.length)) put(g, w - scoreText.length, 0, scoreText, { c: '#565f89' })
  if (text) put(g, labelX, 0, text, ride.label === 'bail!' ? { c: '#f7768e', b: true } : { c: '#ffd166', b: true })
  if (act === 'ask' && ride.bail === undefined) {
    const row = Math.max(0, Math.floor((GROUND - 1 - Math.round(ride.h) - 6) / 2))
    put(g, sx + 8, row, '?', { c: '#ffd166', b: true })
  }
  return g
}
