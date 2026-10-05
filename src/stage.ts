// The little theater: plays a skit the muse wrote (muse.ts) on the show's six
// rows. The skit brings the place, Clawd's look, props and beats; this acts
// them out. Clawd walks, carries, pushes and throws props, jumps, waves, sits,
// sleeps; props bob, float, spin or orbit on their own; effects go off around
// him as glyphs; what he says shows beside his head. Pure: a function of the
// skit and the tick, so any frame can be drawn on its own.
import { canvas, cells, dot, drawFine, frame, mod, noise, overlay, put, textWidth } from './cells'
import type { Canvas, Grid, Style } from './cells'
import { CLAWD, CLAWD_W, drawClawd } from './clawd'
import type { MuseLook, MuseSkit, SkitBeat, SkitProp } from './muse'
import { backdrop, skyBody, weather } from './place'
import { glyphStars, ground } from './scenes'

/** The theater's rows (12 px): sky and room for a hat above, the floor at the bottom. */
export const STAGE_ROWS = 6
/** Ticks per second (the band draws every 100 ms). */
const TPS = 10
/** The floor's pixel row, and Clawd's top when he stands on it. */
const FLOOR = STAGE_ROWS * 2 - 1
const STAND_Y = FLOOR - 7
/** A prop held over his head: its bottom on his top. */
const OVERHEAD = FLOOR - STAND_Y
/** How long the title shows at the start. */
const TITLE_TICKS = 25

const WOOD = ['#6b4f43', '#5a4238', '#6b4f43', '#7a5a4c', '#5a4238']
const CLAUDE = '#d77757'

/** How long a skit plays, in ticks. */
export const skitLength = (skit: MuseSkit) => Math.round(skit.beats.reduce((n, b) => n + b.secs, 0) * TPS)

// ---- acting it out --------------------------------------------------------------

type PropAt = { x: number; lift: number; held: boolean; flip: boolean }
type Moment = {
  /** Clawd's left column (pixels), how high he is off the floor, his frame. */
  x: number
  lift: number
  art: readonly string[]
  /** Sitting or asleep: drawn low, legs folded under. */
  isLow: boolean
  /** Where his eyes look: -1 left, 1 right, 0 ahead. */
  gaze: number
  eyes: MuseLook['eyes'] | null
  props: Map<string, PropAt>
  beat: SkitBeat | null
  /** Ticks into the beat, and the skit. */
  e: number
}

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const clamp01 = (p: number) => Math.min(1, Math.max(0, p))

/** A prop's width and height in pixels (its art is fine: two characters a pixel). */
function sizeOf(prop: SkitProp): { w: number; h: number } {
  const art = prop.frames[0]!
  return { w: Math.max(...art.map(r => r.length)) / 2, h: art.length / 2 }
}

/** Where Clawd stands on a stage `w` wide for a beat's `to`, 0 to 1. */
const spot = (w: number, f: number) => f * Math.max(0, w - CLAWD_W)

/** The skit's state at tick `e`: every beat before it played through, the current one partway. */
function momentAt(skit: MuseSkit, e: number, w: number): Moment {
  const props = new Map<string, PropAt>()
  for (const prop of skit.props) props.set(prop.id, { x: prop.x * Math.max(0, w - sizeOf(prop).w), lift: 0, held: false, flip: false })
  // He starts left of the first prop, or a third of the way in.
  const first = skit.props[0]
  let x = first ? Math.max(0, props.get(first.id)!.x - CLAWD_W - 2) : spot(w, 0.3)
  let from = 0
  const beside = (id: string) => Math.max(0, props.get(id)!.x - CLAWD_W - 1)
  for (const [i, beat] of skit.beats.entries()) {
    const d = Math.max(1, Math.round(beat.secs * TPS))
    const isNow = e < from + d || i === skit.beats.length - 1
    const p = isNow ? clamp01((e - from) / d) : 1
    const local = isNow ? e - from : d
    const prop = beat.prop ? skit.props.find(q => q.id === beat.prop) ?? null : null
    const at = prop ? props.get(prop.id)! : null
    const size = prop ? sizeOf(prop) : { w: 0, h: 0 }
    const target = beat.to !== null ? spot(w, beat.to) : null
    const m: Moment = { x, lift: 0, art: CLAWD.stand, isLow: false, gaze: 0, eyes: null, props, beat, e: local }
    const step = mod(local, 4) < 2
    const beatArt = (a: readonly string[], b: readonly string[]) => (mod(local, 6) < 3 ? a : b)
    switch (beat.do) {
      case 'walk': {
        const to = target ?? (at ? beside(prop!.id) : spot(w, x < w / 2 ? 0.75 : 0.15))
        m.x = lerp(x, to, ease(p))
        m.art = p < 1 && step ? CLAWD.step : CLAWD.stand
        m.lift = p < 1 && step ? 1 : 0
        if (p >= 1) x = to
        break
      }
      case 'carry':
      case 'throw': {
        // First to the prop and up over his head, then off with it.
        const pick = Math.min(0.35, 1.5 / beat.secs)
        const start = Math.max(0, at!.x - CLAWD_W / 2 + size.w / 2)
        if (p < pick) {
          m.x = lerp(x, start, ease(p / pick))
          m.art = step ? CLAWD.step : CLAWD.stand
          // Already there: up it goes.
          if (Math.abs(x - start) < 1.5) {
            m.art = CLAWD.up
            Object.assign(at!, { x: start + CLAWD_W / 2 - size.w / 2, lift: OVERHEAD, held: true })
          }
          break
        }
        const q = (p - pick) / (1 - pick)
        const over = (cx: number) => cx + CLAWD_W / 2 - size.w / 2
        if (beat.do === 'carry') {
          const to = target ?? spot(w, start < w / 2 ? 0.8 : 0.1)
          m.x = lerp(start, to, ease(q))
          m.art = CLAWD.up
          m.lift = q < 1 && step ? 1 : 0
          if (q < 1) Object.assign(at!, { x: over(m.x), lift: OVERHEAD, held: true })
          else Object.assign(at!, { x: over(to), lift: 0, held: false })
          if (p >= 1) x = to
        } else {
          // Up, then the arc: from over his head to where `to` says, or the far side.
          m.x = start
          const land = beat.to !== null ? beat.to * Math.max(0, w - size.w) : start < w / 2 ? Math.max(0, w - size.w - 2) : 2
          const fly = clamp01((q - 0.2) / 0.8)
          m.art = q < 0.3 ? CLAWD.up : CLAWD.stand
          if (q < 0.2) Object.assign(at!, { x: over(start), lift: OVERHEAD, held: true })
          else {
            const peak = OVERHEAD + 4
            const h = fly < 1 ? lerp(OVERHEAD, 0, fly) + Math.sin(Math.PI * fly) * peak * 0.6 : 0
            Object.assign(at!, { x: lerp(over(start), land, fly), lift: h, held: false, flip: fly < 1 && mod(local, 4) < 2 })
          }
          if (p >= 1) x = start
        }
        break
      }
      case 'push': {
        const pick = Math.min(0.3, 1.2 / beat.secs)
        const start = beside(prop!.id)
        if (p < pick) {
          m.x = lerp(x, start, ease(p / pick))
          m.art = step ? CLAWD.step : CLAWD.stand
          break
        }
        const q = (p - pick) / (1 - pick)
        const to = target ?? spot(w, start < w / 2 ? 0.75 : 0.1)
        m.x = lerp(start, to, ease(q))
        m.art = step ? CLAWD.work : CLAWD.stand
        at!.x = m.x + CLAWD_W + 1
        if (p >= 1) x = to
        break
      }
      case 'jump': {
        // A hop a second.
        const hop = mod(local, TPS) / TPS
        m.lift = Math.round(Math.sin(Math.PI * hop) * 4)
        m.art = m.lift > 1 ? CLAWD.up : CLAWD.stand
        break
      }
      case 'wave':
        m.art = beatArt(CLAWD.wave, CLAWD.stand)
        break
      case 'cheer':
        m.art = beatArt(CLAWD.up, CLAWD.stand)
        m.lift = mod(local, 6) < 3 ? 1 : 0
        break
      case 'dance':
        m.art = beatArt(CLAWD.up, CLAWD.work)
        m.x = x + (mod(local, 8) < 4 ? -1 : 1)
        m.lift = mod(local, 4) < 2 ? 1 : 0
        break
      case 'sit':
        m.isLow = true
        break
      case 'sleep':
        m.isLow = true
        m.eyes = 'closed'
        break
      case 'look':
        if (at) m.gaze = at.x + size.w / 2 < x + CLAWD_W / 2 ? -1 : 1
        else m.gaze = mod(local, 20) < 10 ? -1 : 1
        break
      case 'work': {
        if (at && Math.abs(beside(prop!.id) - x) > 1) {
          const pick = Math.min(0.3, 1.2 / beat.secs)
          if (p < pick) {
            m.x = lerp(x, beside(prop!.id), ease(p / pick))
            m.art = step ? CLAWD.step : CLAWD.stand
            break
          }
          m.x = beside(prop!.id)
        }
        m.art = beatArt(CLAWD.work, CLAWD.stand)
        if (p >= 1) x = m.x
        break
      }
      case 'stand':
        break
    }
    if (isNow) {
      if (m.art === CLAWD.stand && !m.isLow && mod(e, 30) < 2) m.art = CLAWD.blink
      return m
    }
    from += d
  }
  return { x, lift: 0, art: CLAWD.stand, isLow: false, gaze: 0, eyes: null, props, beat: null, e: 0 }
}

// ---- drawing ------------------------------------------------------------------------

/** A prop as it moves on its own at tick `t`. */
function drawProp(cv: Canvas, prop: SkitProp, at: PropAt, t: number, w: number): void {
  const { w: pw } = sizeOf(prop)
  let dx = 0
  let lift = at.lift
  let art = frame(prop.frames, Math.floor(t / 4))
  if (!at.held && at.lift === 0) {
    switch (prop.motion) {
      case 'bob':
        lift += mod(t, 10) < 5 ? 0.5 : 0
        break
      case 'float':
        lift += 3 + Math.sin(t * 0.2) * 1.5
        break
      case 'fall': {
        // Drops in from the sky now and then.
        const cycle = mod(t, 60)
        lift += cycle < 12 ? (12 - cycle) * 1 : 0
        break
      }
      case 'spin':
        if (mod(t, 6) < 3) art = art.map(r => [...r].reverse().join(''))
        break
      case 'blink':
        if (mod(t, 16) >= 12) return
        break
      case 'shake':
        dx = mod(t, 2) ? 0.5 : -0.5
        break
      case 'orbit':
        dx = Math.cos(t * 0.15) * 3
        lift += 2 + Math.sin(t * 0.15) * 2
        break
      case 'grow': {
        // Rises out of the floor, row by row, then stays.
        const shown = Math.min(art.length, Math.floor(mod(t, 80) / 3) + 1)
        art = art.slice(art.length - shown)
        break
      }
      case 'still':
        break
    }
  }
  if (at.flip) art = art.map(r => [...r].reverse().join(''))
  const x = Math.min(Math.max(0, at.x + dx), w - pw)
  drawFine(cv, x, FLOOR - art.length / 2 - lift, art, prop.colors)
}

/** Clawd for a moment: low when he sits, eyes turned where he looks. */
function drawActor(cv: Canvas, skit: MuseSkit, m: Moment, t: number): void {
  const look = skit.look || m.eyes ? ({ ...(skit.look ?? { hat: [], held: [], colors: {}, shiny: false, eyes: 'normal' }), ...(m.eyes ? { eyes: m.eyes } : {}) } as MuseLook) : null
  const art = m.isLow ? m.art.slice(0, 5) : m.art
  const y = (m.isLow ? STAND_Y + 2 : STAND_Y) - m.lift
  drawClawd(cv, m.x, y, art, look, t)
  if (m.gaze !== 0 && (!look || look.eyes === 'normal')) {
    // Eyes moved a fine pixel toward what he looks at.
    for (const ex of [4, 9]) {
      for (let dy = 2; dy < 6; dy++) {
        const fy = y * 2 + dy
        const fx = (m.x + ex) * 2
        dot(cv, fx + (m.gaze > 0 ? 0 : 1), fy, CLAUDE)
        dot(cv, fx + (m.gaze > 0 ? 2 : -1), fy, '#2b1d18')
      }
    }
  }
}

type Burst = { glyphs: readonly string[]; colors: readonly string[]; motion: 'rise' | 'burst' | 'fall' | 'flash' | 'pop' }
const EFFECT: Record<string, Burst> = {
  sparks: { glyphs: ['✦', '·', '*'], colors: ['#ffd166', '#ff9e64'], motion: 'burst' },
  hearts: { glyphs: ['♥', '♡'], colors: ['#ff6b9d', '#ff8fab'], motion: 'rise' },
  notes: { glyphs: ['♪', '♫'], colors: ['#bb9af7', '#7dcfff'], motion: 'rise' },
  zzz: { glyphs: ['z', 'Z'], colors: ['#a9b1d6', '#7aa2f7'], motion: 'rise' },
  steam: { glyphs: ['~', '∿'], colors: ['#c0caf5', '#787c99'], motion: 'rise' },
  confetti: { glyphs: ['✻', '·', '✶', '*'], colors: ['#ff6b9d', '#ffd166', '#9ece6a', '#7dcfff', '#bb9af7'], motion: 'burst' },
  stars: { glyphs: ['✦', '✧', '·'], colors: ['#ffd166', '#fff3c4'], motion: 'burst' },
  bubbles: { glyphs: ['o', '°', '∘'], colors: ['#7dcfff', '#b4f9f8'], motion: 'rise' },
  lightning: { glyphs: ['ϟ'], colors: ['#ffd166', '#fff3c4'], motion: 'flash' },
  smoke: { glyphs: ['∘', '○', '·'], colors: ['#787c99', '#565f89'], motion: 'rise' },
  rain: { glyphs: ['╱', '·'], colors: ['#7aa2f7', '#565f89'], motion: 'fall' },
  question: { glyphs: ['?'], colors: ['#e0af68'], motion: 'pop' },
  exclaim: { glyphs: ['!'], colors: ['#f7768e'], motion: 'pop' },
}

/** A glyph only where the cell is empty. */
function mark(g: Grid, x: number, row: number, text: string, style: Style): void {
  const cell = g[row]?.[Math.round(x)]
  if (cell && cell.ch === ' ') put(g, x, row, text, style)
}

/** The beat's effect around (`cx`, `row`): Clawd's head, or the prop he acts on. */
function effect(g: Grid, name: string, cx: number, row: number, e: number): void {
  const fx = EFFECT[name]
  if (!fx) return
  const rows = g.length
  const pick = (i: number) => ({ ch: fx.glyphs[i % fx.glyphs.length]!, c: fx.colors[i % fx.colors.length]! })
  switch (fx.motion) {
    case 'rise':
      for (let i = 0; i < 3; i++) {
        const age = mod(e + i * 7, 21)
        const { ch, c } = pick(i + Math.floor((e + i * 7) / 21))
        mark(g, cx + 2 + i * 2 + Math.round(Math.sin((e + i * 9) * 0.3)), Math.max(0, row - Math.floor(age / 7)), ch, { c, d: age > 14 })
      }
      break
    case 'burst':
      for (let i = 0; i < 6; i++) {
        const age = mod(e, 12)
        const angle = (i / 6) * Math.PI * 2 + noise(i + Math.floor(e / 12)) * 0.8
        const r = 1 + age * 0.5
        const { ch, c } = pick(i)
        mark(g, cx + Math.cos(angle) * r * 2, Math.min(rows - 2, Math.max(0, row + Math.round(Math.sin(angle) * r * 0.5))), ch, { c, d: age > 8 })
      }
      break
    case 'fall':
      for (let i = 0; i < 8; i++) {
        const x = cx - 8 + Math.floor(noise(i * 3) * 18)
        const { ch, c } = pick(i)
        mark(g, x - Math.floor((e + i * 3) / 3) % 3, mod(Math.floor((e + i * 5) / 2), rows - 1), ch, { c })
      }
      break
    case 'flash':
      if (mod(e, 8) < 3) {
        const { ch, c } = pick(0)
        mark(g, cx + 1, Math.max(0, row - 1), ch, { c, b: true })
        mark(g, cx - 3, row, ch, { c })
      }
      break
    case 'pop': {
      // Over his head, whatever is drawn there.
      const { ch, c } = pick(0)
      if (mod(e, 10) < 7) overlay(g, cx + 5, Math.max(0, row - 1), ch, { c, b: true })
      break
    }
  }
}

/** What he says, beside his head: right of him when it fits, else left. */
function speech(g: Grid, text: string, x: number, row: number): void {
  const w = g[0]!.length
  const width = textWidth(text) + 2
  const right = Math.round(x + CLAWD_W + 1)
  const at = right + width <= w ? right : Math.max(0, Math.round(x) - width - 1)
  overlay(g, at, row, `“${text}”`, { c: '#e9e4da' })
}

/** The skit at tick `t` (from its start) on a stage `w` cells wide. */
export function skitScene(skit: MuseSkit, t: number, w: number, seed = 0): Grid {
  const cv = canvas(w, STAGE_ROWS)
  const place = skit.place
  if (place) {
    skyBody(cv, place, 1)
    backdrop(cv, place, 0, FLOOR - 1, 0)
    ground(cv, 0, FLOOR, 0, [place.colors.ground, place.colors.near, place.colors.ground])
  } else ground(cv, 0, FLOOR, 0, WOOD)
  const m = momentAt(skit, Math.min(t, skitLength(skit) - 1), w)
  // Props behind him, then him, then whatever he holds up.
  for (const prop of skit.props) if (!m.props.get(prop.id)!.held) drawProp(cv, prop, m.props.get(prop.id)!, t, w)
  drawActor(cv, skit, m, t)
  for (const prop of skit.props) if (m.props.get(prop.id)!.held) drawProp(cv, prop, m.props.get(prop.id)!, t, w)

  const g = cells(cv)
  if (place) weather(g, place, t, seed)
  else glyphStars(g, t, Math.floor(w / 5), 0.03, ['·', '✻'], ['#8a6a5c', '#a97c68', '#6b5248'], 3)
  const head = Math.max(0, Math.floor((STAND_Y - m.lift) / 2))
  if (m.beat) {
    const target = m.beat.prop ? m.props.get(m.beat.prop) : null
    const fx = m.beat.effect === 'none' && m.beat.do === 'sleep' ? 'zzz' : m.beat.effect
    const prop = m.beat.prop ? skit.props.find(p => p.id === m.beat!.prop) : null
    if (target && prop && fx !== 'zzz' && fx !== 'question' && fx !== 'exclaim') {
      const { w: pw, h: ph } = sizeOf(prop)
      effect(g, fx, target.x + pw / 2, Math.max(0, Math.floor((FLOOR - ph - target.lift) / 2)), m.e)
    } else effect(g, fx, m.x + CLAWD_W / 2, head, m.e)
    if (m.beat.say) speech(g, m.beat.say, m.x, Math.max(0, head))
  }
  if (t < TITLE_TICKS) overlay(g, 1, 0, `▸ ${skit.title}`, { c: place?.colors.accent ?? '#e9b49a', d: t > TITLE_TICKS - 6 })
  return g
}
