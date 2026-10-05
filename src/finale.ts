// The finale: a few seconds of pixel show after a turn ends, a different one
// each time (picked by the finale's id). A finished turn gets a celebration
// (fireworks, a confetti cannon, a curtain call, a trophy, a disco, a rainbow
// dash, a high-five, a level-up), an interrupted one a little sadness (a rain
// cloud, a shrug, a walk off), an error some trouble (a glitch, an explosion,
// a short circuit). The label (`Done · 12s`) always reads. Pure: a function of
// the kind, the label, the tick, the width and the id.
import { blank, canvas, cells, dot, mod, noise, overlay, put, textWidth } from './cells'
import type { Canvas, Grid, Style } from './cells'
import { CLAWD_W, drawClawd, poseArt } from './clawd'
import type { Arm, Legs } from './clawd'
import type { MuseLook } from './muse'

export type FinaleKind = 'answer' | 'aborted' | 'error'

/** How long a finale plays, in ticks of 100 ms. */
export const FINALE_TICKS = 40

const ROWS = 6
const FLOOR = ROWS * 2 - 1
const STAND = FLOOR - 7
const CLAUDE = '#d77757'
const PARTY = ['#ff6b9d', '#ffd166', '#9ece6a', '#7dcfff', '#bb9af7', '#ff9e64']
const CAST = ['#7aa2f7', '#9ece6a', '#bb9af7', '#ff8fab', '#7dcfff', '#e0af68']

/** A small number for a finale's id. */
function hashOf(id: string): number {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619)
  return (h >>> 0) % 9973
}

type Scene = {
  cv: Canvas
  w: number
  t: number
  salt: number
  /** Glyphs to add once the pixels are cells. */
  after: ((g: Grid) => void)[]
}

type Pose = { left?: Arm; right?: Arm; legs?: Legs; eyes?: MuseLook['eyes']; color?: string; mirror?: boolean; shiny?: boolean; low?: boolean }

/** A Clawd with his top-left at pixel (`x`, `y`). */
function clawd(s: Scene, x: number, y: number, pose: Pose = {}): void {
  let art = poseArt(pose.left ?? 'out', pose.right ?? 'out', pose.legs ?? 'stand')
  if (pose.mirror) art = art.map(r => [...r].reverse().join(''))
  if (pose.low) art = art.slice(0, 5)
  const look: MuseLook | null = pose.eyes || pose.shiny ? { eyes: pose.eyes ?? 'normal', hat: [], held: [], colors: {}, shiny: !!pose.shiny } : null
  drawClawd(s.cv, x, (pose.low ? y + 2 : y), art, look, s.t, pose.color)
}

/** A glyph where the cell is empty. */
function mark(g: Grid, x: number, row: number, text: string, style: Style): void {
  const cell = g[row]?.[Math.round(x)]
  if (cell && cell.ch === ' ') put(g, x, row, text, style)
}

/** A ring of fine dots around fine pixel (`fx`, `fy`). */
function ring(cv: Canvas, fx: number, fy: number, r: number, color: string, count = 16): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    dot(cv, fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.9, color)
  }
}

/** A #rrggbb color faded toward black by `by` (0 to 1). */
function fade(hex: string, by: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  const k = Math.max(0, 1 - by)
  const ch = (v: number) => Math.round(v * k).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

const alt = (t: number, n = 4) => mod(t, n * 2) < n

// ---- a finished turn ---------------------------------------------------------------

/** Rockets go up and burst into rings while Clawd cheers. */
function fireworks(s: Scene, x: number): void {
  clawd(s, x, STAND - (alt(s.t) ? 1 : 0), { left: alt(s.t) ? 'up' : 'out', right: alt(s.t) ? 'up' : 'out', eyes: 'happy' })
  for (let k = 0; k < 8; k++) {
    const start = k * 4
    const fx = Math.floor(noise(s.salt + k * 7) * s.w * 2)
    const peak = 3 + Math.floor(noise(s.salt + k * 3) * 6)
    const color = PARTY[(s.salt + k) % PARTY.length]!
    const age = s.t - start
    if (age < 0) continue
    if (age < 6) {
      // Rising, with a trail.
      const fy = 22 - (22 - peak) * (age / 6)
      for (let j = 0; j < 3; j++) dot(s.cv, fx, fy + j * 2, fade('#fff3c4', j * 0.3))
    } else if (age < 22) {
      const b = age - 6
      ring(s.cv, fx, peak, 1 + b * 1.1, fade(color, Math.max(0, (b - 8) / 10)), 18)
      if (b < 10) ring(s.cv, fx, peak, b * 0.6, '#fff3c4', 10)
    }
  }
}

/** A cannon of confetti shot from his hand, falling across the band. */
function cannon(s: Scene, x: number): void {
  clawd(s, x, STAND, { right: s.t < 8 ? 'mid' : 'up', left: 'out', eyes: s.t < 8 ? 'normal' : 'happy' })
  s.after.push(g => {
    const hx = x + CLAWD_W
    for (let i = 0; i < 40; i++) {
      const launch = Math.floor(noise(s.salt + i) * 6)
      const age = s.t - launch
      if (age < 0) continue
      const vx = 0.6 + noise(i * 3 + s.salt) * 2.4
      const vy = 0.5 + noise(i * 5 + s.salt) * 0.6
      const cx = hx + vx * age * (noise(i * 11) < 0.25 ? -0.6 : 1)
      const row = 2 - vy * age + 0.035 * age * age * 2
      if (row < 0 || row > ROWS - 1) continue
      mark(g, cx, Math.floor(row), ['✻', '·', '✶', '*', '✦'][i % 5]!, { c: PARTY[i % PARTY.length], d: age > 28 })
    }
  })
}

/** Curtains part on a cast of three Clawds, who bow; flowers land. */
function curtainCall(s: Scene, _x: number): void {
  const n = Math.min(3, Math.max(1, Math.floor((s.w - 4) / (CLAWD_W + 2))))
  const gap = Math.floor((s.w - n * CLAWD_W) / (n + 1))
  const bowing = s.t > 14 && s.t < 30
  for (let i = 0; i < n; i++) {
    const color = i === 0 ? CLAUDE : CAST[(s.salt + i) % CAST.length]!
    clawd(s, gap + i * (CLAWD_W + gap), STAND + (bowing ? 1 : 0), { left: bowing ? 'down' : 'out', right: bowing ? 'down' : i === 0 && s.t > 30 ? 'up' : 'out', eyes: bowing ? 'closed' : 'happy', color })
  }
  // The curtains, opening from the middle.
  const open = Math.min(1, s.t / 10)
  const each = Math.ceil((s.w / 2) * (1 - open) + 3)
  for (let x = 0; x < s.w; x++) {
    if (x >= each && x < s.w - each) continue
    for (let fy = 0; fy < FLOOR * 2; fy++) {
      const fold = mod(x * 2 + Math.floor(fy / 6), 4) < 2
      dot(s.cv, x * 2, fy, fold ? '#8c2f39' : '#a63d47')
      dot(s.cv, x * 2 + 1, fy, fold ? '#7a2832' : '#8c2f39')
    }
  }
  if (s.t > 16) s.after.push(g => {
    for (let i = 0; i < 6; i++) mark(g, gap + Math.floor(noise(i + s.salt) * (s.w - gap * 2)), Math.min(ROWS - 1, Math.floor((s.t - 16 - i * 2) / 2)), '✿', { c: PARTY[i % PARTY.length] })
  })
}

const TROPHY = ['.YYYYYYYYYY.', 'YYYYWYYYYYYY', 'Y.YYWYYYYY.Y', 'Y.YYYYYYYY.Y', '.YYYYYYYYYY.', '...YYYYYY...', '....YYYY....', '.....YY.....', '....OOOO....', '...OOOOOO...']

/** A trophy drops into his raised hands; it shines. */
function trophy(s: Scene, x: number): void {
  const fall = Math.min(1, s.t / 10)
  const hop = s.t > 10 && alt(s.t, 3) ? 1 : 0
  clawd(s, x, STAND - hop, { left: 'up', right: 'up', eyes: s.t > 10 ? 'stars' : 'normal' })
  const tx = (x + CLAWD_W / 2) * 2 - 6
  const ty = Math.round(-10 + (STAND * 2 - 10 + 10) * fall) - hop * 2
  TROPHY.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') dot(s.cv, tx + i, ty + j, ch === 'Y' ? '#ffd166' : ch === 'W' ? '#fff8e1' : '#b8860b')
  }))
  if (s.t > 10) s.after.push(g => {
    for (let i = 0; i < 3; i++) if (alt(s.t + i * 3, 2)) mark(g, x + 2 + i * 5, Math.max(0, Math.floor(ty / 4) - (i % 2)), '✦', { c: '#fff3c4' })
  })
}

/** A disco ball turns over two Clawds dancing on a floor of colored tiles. */
function disco(s: Scene, x: number): void {
  for (let i = 0; i < s.w; i++) {
    const tile = PARTY[mod(Math.floor(i / 3) + Math.floor(s.t / 3), PARTY.length)]!
    for (let fy = FLOOR * 2; fy < FLOOR * 2 + 2; fy++) for (let dx = 0; dx < 2; dx++) dot(s.cv, i * 2 + dx, fy, fade(tile, 0.35))
  }
  const bx = Math.round(s.w * 1.5)
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 10) continue
    dot(s.cv, bx + dx, 4 + dy, mod(dx + dy + Math.floor(s.t / 2), 2) ? '#c0caf5' : '#565f89')
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + s.t * 0.25
    const r = 6 + mod(s.t + i * 3, 14)
    dot(s.cv, bx + Math.cos(a) * r * 2.2, 4 + Math.abs(Math.sin(a)) * r, PARTY[i % PARTY.length]!)
  }
  const other = CAST[s.salt % CAST.length]!
  const beat = alt(s.t, 3)
  clawd(s, x, STAND - (beat ? 1 : 0), { left: beat ? 'up' : 'down', right: beat ? 'down' : 'up', legs: beat ? 'step' : 'stand', eyes: 'happy' })
  const x2 = Math.min(s.w - CLAWD_W, x + CLAWD_W + 3)
  if (x2 > x + CLAWD_W) clawd(s, x2, STAND - (beat ? 0 : 1), { left: beat ? 'down' : 'up', right: beat ? 'up' : 'down', legs: beat ? 'stand' : 'step', eyes: 'shades', color: other })
}

/** He dashes across leaving a rainbow behind him. */
function rainbowDash(s: Scene, _x: number): void {
  const run = Math.min(1, s.t / 26)
  const x = -CLAWD_W + run * (s.w + CLAWD_W * 0.4)
  const bands = ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#7aa2f7', '#bb9af7']
  for (let fx = 0; fx < (x + 2) * 2; fx++) {
    const wave = Math.round(Math.sin((fx + s.t * 3) * 0.25))
    bands.forEach((c, j) => dot(s.cv, fx, STAND * 2 + 3 + j + wave, c))
  }
  clawd(s, x, STAND - (alt(s.t, 2) ? 1 : 0), { left: 'down', right: 'mid', legs: alt(s.t, 1) ? 'step' : 'stand', eyes: 'happy' })
  s.after.push(g => {
    for (let i = 0; i < 6; i++) mark(g, x - 4 - i * 6 - mod(s.t, 3), (i * 2 + s.t) % ROWS, '✦', { c: '#fff3c4', d: i > 2 })
  })
}

/** Two Clawds run in from both sides and high-five in the middle. */
function highFive(s: Scene, _x: number): void {
  const meet = Math.min(1, s.t / 12)
  const mid = s.w / 2
  const ax = (mid - CLAWD_W) * meet - CLAWD_W * (1 - meet)
  const bx = s.w - (s.w - mid) * meet
  const met = s.t >= 12
  const up = met && s.t < 22
  const other = CAST[(s.salt + 1) % CAST.length]!
  clawd(s, ax, STAND - (up ? 2 : 0), { left: met && !up ? 'up' : 'out', right: up ? 'up' : met ? 'up' : 'mid', legs: !met && alt(s.t, 1) ? 'step' : 'stand', eyes: met ? 'happy' : 'normal' })
  clawd(s, bx, STAND - (up ? 2 : 0), { left: up ? 'up' : met ? 'up' : 'mid', right: met && !up ? 'up' : 'out', legs: !met && alt(s.t, 1) ? 'step' : 'stand', eyes: met ? 'happy' : 'normal', color: other })
  if (met && s.t < 26) {
    ring(s.cv, mid * 2, 3, (s.t - 12) * 1.2, fade('#ffd166', (s.t - 12) / 14), 18)
    s.after.push(g => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r = 1 + (s.t - 12) * 0.6
        mark(g, mid + Math.cos(a) * r * 2, Math.max(0, Math.min(ROWS - 1, 1 + Math.round(Math.sin(a) * r * 0.5))), '✦', { c: PARTY[i % PARTY.length] })
      }
    })
  }
}

/** He glows and rings of light pulse out of him. */
function levelUp(s: Scene, x: number): void {
  const cx = (x + CLAWD_W / 2) * 2
  for (let k = 0; k < 3; k++) {
    const age = mod(s.t - k * 6, 18)
    ring(s.cv, cx, STAND * 2 + 7, age * 1.6 + 4, fade('#ffd166', age / 18), 22)
  }
  clawd(s, x, STAND - (alt(s.t, 5) ? 1 : 0), { left: 'up', right: 'up', eyes: 'stars', shiny: true })
  s.after.push(g => {
    for (let i = 0; i < 4; i++) mark(g, x - 2 + i * 6, ROWS - 1 - (mod(s.t + i * 4, 12) >> 1), '↑', { c: '#ffd166', d: mod(s.t + i * 4, 12) > 8 })
  })
}

// ---- an interrupted turn ------------------------------------------------------------

/** A little rain cloud over his head. */
function rainCloud(s: Scene, x: number): void {
  clawd(s, x, STAND, { left: 'down', right: 'down', eyes: 'closed' })
  const cx = (x + CLAWD_W / 2) * 2
  // Three puffs and a flat bottom, drifting a little.
  const drift = Math.round(Math.sin(s.t * 0.2))
  for (const [px, r] of [[-6, 3], [0, 4], [6, 3]] as const) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) dot(s.cv, cx + drift + px + dx, 4 + dy, dy < 0 ? '#9aa5ce' : '#787c99')
  }
  for (let i = 0; i < 7; i++) {
    const fy = 7 + mod(s.t * 2 + i * 3, 6)
    dot(s.cv, cx + drift - 9 + i * 3, fy, '#7aa2f7')
    dot(s.cv, cx + drift - 9 + i * 3, fy + 1, '#7aa2f7')
  }
}

/** A shrug and a sigh. */
function shrug(s: Scene, x: number): void {
  const up = mod(s.t, 16) < 8
  clawd(s, x, STAND, { left: up ? 'mid' : 'out', right: up ? 'mid' : 'out', eyes: up ? 'closed' : 'normal' })
  s.after.push(g => mark(g, x + CLAWD_W - 2, 1 - (up ? 0 : 1) + 1, '…', { c: '#a9b1d6' }))
}

/** He waves and walks off. */
function walkOff(s: Scene, x: number): void {
  const go = Math.max(0, (s.t - 8) / 30)
  clawd(s, x - go * (x + CLAWD_W), STAND - (go > 0 && alt(s.t, 2) ? 1 : 0), { right: s.t < 12 ? (alt(s.t, 2) ? 'up' : 'mid') : 'out', legs: go > 0 && alt(s.t, 2) ? 'step' : 'stand', mirror: go > 0 })
}

// ---- an error ---------------------------------------------------------------------------

/** The band glitches: rows slip sideways, red blocks flicker. */
function glitch(s: Scene, x: number): void {
  clawd(s, x + (alt(s.t, 1) ? 0.5 : 0), STAND, { left: 'down', right: 'up', eyes: 'dizzy' })
  s.after.push(g => {
    const shift = Math.floor(s.t / 3)
    for (const [r, row] of g.entries()) {
      const by = noise(r * 7 + shift) < 0.4 ? Math.floor((noise(r + shift * 3) - 0.5) * 6) : 0
      if (by !== 0) g[r] = row.slice(-by).concat(row.slice(0, -by)).map(c => (c.ch === '' ? { ch: ' ' } : c))
    }
    for (let x2 = 0; x2 < s.w; x2++) if (noise(x2 + s.t * 13) < 0.05) mark(g, x2, mod(x2, ROWS), ['▚', '▞', '░'][mod(x2 + s.t, 3)]!, { c: '#e63946', d: true })
  })
}

/** A bang, then he stands there charred, smoking. */
function explosion(s: Scene, x: number): void {
  const burnt = s.t >= 8
  clawd(s, x, STAND, { left: burnt ? 'down' : 'out', right: burnt ? 'down' : 'out', eyes: burnt ? 'dizzy' : 'normal', color: burnt ? '#3b3640' : undefined })
  const cx = (x + CLAWD_W / 2) * 2
  if (s.t >= 5 && s.t < 18) {
    const b = s.t - 5
    for (const [k, c] of ['#ffd166', '#ff9e64', '#f7768e'].entries()) ring(s.cv, cx, 12, b * 1.4 + k * 2, fade(c, b / 13), 20)
  }
  if (burnt) s.after.push(g => {
    for (let i = 0; i < 3; i++) {
      const age = mod(s.t + i * 5, 15)
      mark(g, x + 4 + i * 3, Math.max(0, 2 - Math.floor(age / 5)), ['∘', '○', '·'][i]!, { c: '#787c99', d: age > 10 })
    }
  })
}

/** Sparks and lightning crackle; he shakes. */
function shortCircuit(s: Scene, x: number): void {
  clawd(s, x + (alt(s.t, 1) ? -0.5 : 0.5), STAND, { left: alt(s.t, 2) ? 'up' : 'down', right: alt(s.t, 2) ? 'down' : 'up', eyes: 'dizzy' })
  for (let i = 0; i < 10; i++) if (noise(i + s.t * 7) < 0.4) dot(s.cv, (x + noise(i * 3 + s.t) * CLAWD_W) * 2, STAND * 2 + noise(i * 5 + s.t) * 14, '#ffd166')
  s.after.push(g => {
    if (alt(s.t, 2)) {
      mark(g, x - 2, 1, 'ϟ', { c: '#ffd166', b: true })
      mark(g, x + CLAWD_W + 1, 2, 'ϟ', { c: '#fff3c4', b: true })
    }
  })
}

const SCENES: Record<FinaleKind, ((s: Scene, x: number) => void)[]> = {
  answer: [fireworks, cannon, curtainCall, trophy, disco, rainbowDash, highFive, levelUp],
  aborted: [rainCloud, shrug, walkOff],
  error: [glitch, explosion, shortCircuit],
}
/** Variants that move the cast across the band: their label goes on the top row instead. */
const ROAMING = new Set<(s: Scene, x: number) => void>([curtainCall, rainbowDash, highFive, disco])

/** The finale at tick `t`: `ROWS` rows of `w` cells, its variant picked by `id`. */
export function finale(kind: FinaleKind, label: string, t: number, w: number, id = ''): Grid {
  const salt = hashOf(`${kind}:${id}`)
  const pool = SCENES[kind]
  const scene = pool[salt % pool.length]!
  const tw = textWidth(label)
  const style: Style = kind === 'answer' ? { c: CLAUDE, b: true } : kind === 'aborted' ? { c: '#adb5bd' } : { c: '#e63946', b: true }
  // Too narrow for a Clawd and the label side by side: just the label.
  if (w < CLAWD_W + tw + 4) {
    const g = blank(w, ROWS)
    put(g, Math.max(0, Math.floor((w - tw) / 2)), 2, label, style)
    return g
  }
  const s: Scene = { cv: canvas(w, ROWS), w, t, salt, after: [] }
  const block = CLAWD_W + 2 + tw
  const x = Math.max(0, Math.floor((w - block) / 2))
  scene(s, x)
  const g = cells(s.cv)
  for (const f of s.after) f(g)
  const flicker = kind === 'error' && mod(t, 6) === 0
  if (!flicker) {
    if (ROAMING.has(scene)) overlay(g, Math.max(0, Math.floor((w - tw) / 2)), 0, label, style)
    else overlay(g, x + CLAWD_W + 2, 2, label, style)
  }
  return g
}

/** For the gallery: how many variants each kind has. */
export const FINALE_VARIANTS = { answer: SCENES.answer.length, aborted: SCENES.aborted.length, error: SCENES.error.length }
/** The id that picks variant `n` of `kind` (for the gallery and the tests). */
export function finaleIdFor(kind: FinaleKind, n: number): string {
  for (let i = 0; i < 10_000; i++) if (hashOf(`${kind}:${i}`) % SCENES[kind].length === n) return String(i)
  return '0'
}
