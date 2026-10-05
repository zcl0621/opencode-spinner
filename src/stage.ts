// The little theater: plays a skit the muse wrote (muse.ts) on the show's six
// rows. The skit brings the place, a cast of up to three Clawds, props and
// beats; this acts them out. In a beat each Clawd may do something at once:
// walk, run, dance, play an instrument, ride a car, fly, eat, read, cast a
// spell, punch, high-five or hug another Clawd, chase him... Partners react
// (one punched reels, one chased runs, a thrown prop is caught), the others
// look on. Props move on their own and keep their own effects going; effects
// go off as glyphs; lines show beside the speaker's head. Pure: a function of
// the skit and the tick, so any frame can be drawn on its own.
import { canvas, cells, dot, drawFine, frame, mod, noise, overlay, put, textWidth } from './cells'
import type { Canvas, Grid, Style } from './cells'
import { CLAWD_W, drawClawd, poseArt } from './clawd'
import type { Arm, Legs } from './clawd'
import { upgradeSkit } from './muse'
import type { MuseLook, MuseSkit, SkitAct, SkitProp } from './muse'
import { backdrop, skyBody, weather } from './place'
import { glyphStars, ground } from './scenes'

/** The theater's rows (12 px): sky and room for a hat above, the floor at the bottom. */
export const STAGE_ROWS = 6
/** Ticks per second (the band draws every 100 ms). */
const TPS = 10
/** The floor's pixel row, and a Clawd's top when he stands on it. */
const FLOOR = STAGE_ROWS * 2 - 1
const STAND_Y = FLOOR - 7
/** A prop held over a head: its bottom on his top. */
const OVERHEAD = FLOOR - STAND_Y
/** How long the title (and the cast's names) show at the start. */
const TITLE_TICKS = 25
/** Pixels the world scrolls per tick while someone rides, flies or swims on the spot. */
const SCROLL = 1.2

const WOOD = ['#6b4f43', '#5a4238', '#6b4f43', '#7a5a4c', '#5a4238']
const ROAD = ['#3b3b44', '#3b3b44', '#3b3b44', '#e0af68', '#3b3b44', '#3b3b44']

const upgraded = new WeakMap<MuseSkit, MuseSkit>()
/** A skit in today's shape (kept skits may be older). */
function current(skit: MuseSkit): MuseSkit {
  let s = upgraded.get(skit)
  if (!s) {
    s = upgradeSkit(skit)
    upgraded.set(skit, s)
  }
  return s
}

/** How long a skit plays, in ticks. */
export const skitLength = (skit: MuseSkit) => Math.round(current(skit).beats.reduce((n, b) => n + b.secs, 0) * TPS)

// ---- acting it out --------------------------------------------------------------

/** How a prop is held: over the head, in front, at the mouth, up in a hand, ridden, or hiding someone. */
type Hold = 'over' | 'front' | 'mouth' | 'hand' | 'ride' | 'hide'
type PropAt = { x: number; lift: number; hold: Hold | null; flip: boolean; shown: number; gone: boolean }
type ActorAt = {
  x: number
  lift: number
  left: Arm
  right: Arm
  legs: Legs
  isBlink: boolean
  /** Sitting, asleep, hiding: drawn low, legs folded under. */
  isLow: boolean
  /** Where his eyes look: -1 left, 1 right, 0 ahead. */
  gaze: number
  eyes: MuseLook['eyes'] | null
  isMirror: boolean
  /** Gone for a moment (teleporting). */
  isHidden: boolean
}
/** An effect to set off, around a pixel spot (`x` centre, `y` top), `e` ticks in. */
type Burst = { name: string; x: number; y: number; e: number }
type Moment = { actors: ActorAt[]; props: Map<string, PropAt>; scroll: number; bursts: Burst[]; lines: { who: number; say: string }[] }

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const clamp01 = (p: number) => Math.min(1, Math.max(0, p))

/** A prop's width and height in pixels (its art is fine: two characters a pixel). */
function sizeOf(prop: SkitProp): { w: number; h: number } {
  const art = prop.frames[0]!
  return { w: Math.max(...art.map(r => r.length)) / 2, h: art.length / 2 }
}

/** Where a Clawd stands on a stage `w` wide for a `to` of 0 to 1. */
const spot = (w: number, f: number) => f * Math.max(0, w - CLAWD_W)

/** Effects some acts set off when the script names none. */
const AUTO: Partial<Record<SkitAct['do'], string>> = {
  sleep: 'zzz', strum: 'notes', drum: 'notes', blow: 'notes', keys: 'notes', fall: 'stars', think: 'thought', dig: 'dust',
  swim: 'bubbles', fly: 'wind', punch: 'impact', kick: 'impact', hug: 'hearts', highfive: 'sparks', cast: 'stars', run: 'dust',
  cry: 'tears', sing: 'notes', panic: 'exclaim', faint: 'stars', teleport: 'sparks', kneel: 'hearts', stir: 'steam', sweep: 'dust',
  photo: 'sparks', argue: 'exclaim', scare: 'exclaim', waltz: 'notes', laugh: 'sparks', meditate: 'stars',
}

const idle = (x: number): ActorAt => ({ x, lift: 0, left: 'out', right: 'out', legs: 'stand', isBlink: false, isLow: false, gaze: 0, eyes: null, isMirror: false, isHidden: false })

/** The skit's state at tick `e`: every beat before it played through, the current one partway. */
function momentAt(skit: MuseSkit, e: number, w: number): Moment {
  const props = new Map<string, PropAt>()
  for (const prop of skit.props) props.set(prop.id, { x: prop.x * Math.max(0, w - sizeOf(prop).w), lift: 0, hold: null, flip: false, shown: 1, gone: false })
  const n = skit.cast.length
  // The cast spread across the stage, the lone Clawd left of the first prop.
  const first = skit.props[0]
  const starts = n === 1 ? [first ? Math.max(0, props.get(first.id)!.x - CLAWD_W - 2) : spot(w, 0.3)] : n === 2 ? [spot(w, 0.15), spot(w, 0.6)] : [spot(w, 0.05), spot(w, 0.45), spot(w, 0.85)]
  const xs = starts.slice(0, n)
  let scroll = 0
  let from = 0
  const maxX = Math.max(0, w - CLAWD_W)
  const fit = (x: number) => Math.min(maxX, Math.max(0, x))

  for (const [bi, beat] of skit.beats.entries()) {
    const d = Math.max(1, Math.round(beat.secs * TPS))
    const isNow = e < from + d || bi === skit.beats.length - 1
    const p = isNow ? clamp01((e - from) / d) : 1
    const local = isNow ? Math.min(e - from, d) : d
    const actors = xs.map(idle)
    const bursts: Burst[] = []
    const lines: { who: number; say: string }[] = []
    const busy = new Set(beat.acts.map(a => a.who))
    const step = mod(local, 4) < 2
    const alt = mod(local, 6) < 3
    let scrolls = false

    for (const act of beat.acts) {
      const i = act.who
      const me = actors[i]!
      const x0 = xs[i]!
      const prop = act.prop ? skit.props.find(q => q.id === act.prop) ?? null : null
      const at = prop ? props.get(prop.id)! : null
      const size = prop ? sizeOf(prop) : { w: 0, h: 0 }
      const partner = act.with !== null ? actors[act.with] ?? null : null
      const px0 = act.with !== null ? xs[act.with]! : 0
      const target = act.to !== null ? spot(w, act.to) : null
      // Beside a prop or a partner, on the side he is on now.
      const besideProp = () => (x0 + CLAWD_W / 2 < at!.x + size.w / 2 ? at!.x - CLAWD_W - 1 : at!.x + size.w + 1)
      const besidePartner = (gap = 1) => (x0 < px0 ? px0 - CLAWD_W - gap : px0 + CLAWD_W + gap)
      const centreOn = () => at!.x + size.w / 2 - CLAWD_W / 2
      /** First he walks to `to` (within `share` of the beat); then `q`, 0 to 1, runs over the rest. */
      const approach = (to: number, share = 0.3): number | null => {
        const pick = Math.abs(to - x0) < 1.5 ? 0 : Math.min(share, 1.5 / beat.secs)
        if (p < pick) {
          me.x = fit(lerp(x0, to, ease(p / pick)))
          me.legs = step ? 'step' : 'stand'
          me.lift = step ? 1 : 0
          return null
        }
        me.x = fit(to)
        return pick >= 1 ? 1 : (p - pick) / (1 - pick)
      }
      const top = () => STAND_Y - me.lift
      const holdAt = (hold: Hold) => {
        if (!at) return
        at.hold = hold
        if (hold === 'over') Object.assign(at, { x: me.x + CLAWD_W / 2 - size.w / 2, lift: FLOOR - top() })
        else if (hold === 'front') Object.assign(at, { x: me.x + CLAWD_W / 2 - size.w / 2 + 1, lift: me.lift })
        else if (hold === 'mouth') Object.assign(at, { x: me.x + CLAWD_W - 3, lift: FLOOR - (top() + 4) })
        else if (hold === 'hand') Object.assign(at, { x: me.x + CLAWD_W - 1 - size.w / 2, lift: FLOOR - (top() + 1) })
      }
      const move = act.do === 'move' ? skit.moves?.find(m => m.name === act.move) ?? null : null
      const fx = act.effect !== 'none' ? act.effect : move ? (move.effect !== 'none' ? move.effect : undefined) : AUTO[act.do]
      const headBurst = (name = fx) => name && bursts.push({ name, x: me.x + CLAWD_W / 2, y: top(), e: local })
      if (act.say) lines.push({ who: i, say: act.say })

      switch (act.do) {
        case 'walk':
        case 'run': {
          const to = target ?? (at ? besideProp() : partner ? besidePartner() : spot(w, x0 < w / 2 ? 0.75 : 0.15))
          const pace = act.do === 'run' ? Math.min(1, p * 1.7) : p
          me.x = fit(lerp(x0, to, ease(pace)))
          const moving = pace < 1
          me.legs = moving && (act.do === 'run' ? mod(local, 2) === 0 : step) ? 'step' : 'stand'
          me.lift = moving && step ? 1 : 0
          if (act.do === 'run' && moving) [me.left, me.right] = alt ? ['down', 'mid'] : ['mid', 'down']
          if (act.do === 'run' && moving) headBurst()
          else if (act.do === 'walk') headBurst()
          break
        }
        case 'stand':
          headBurst()
          break
        case 'jump': {
          const hop = mod(local, TPS) / TPS
          me.lift = Math.round(Math.sin(Math.PI * hop) * 4)
          if (me.lift > 1) [me.left, me.right] = ['up', 'up']
          headBurst()
          break
        }
        case 'wave':
          me.right = alt ? 'up' : 'mid'
          headBurst()
          break
        case 'cheer':
          ;[me.left, me.right] = alt ? ['up', 'up'] : ['out', 'out']
          me.lift = alt ? 1 : 0
          headBurst()
          break
        case 'dance':
          ;[me.left, me.right] = alt ? ['up', 'down'] : ['down', 'up']
          me.x = fit(x0 + (mod(local, 8) < 4 ? -1 : 1))
          me.lift = step ? 1 : 0
          me.legs = alt ? 'step' : 'stand'
          headBurst()
          break
        case 'sit':
          me.isLow = true
          headBurst()
          break
        case 'sleep':
          me.isLow = true
          me.eyes = 'closed'
          ;[me.left, me.right] = ['down', 'down']
          headBurst()
          break
        case 'look':
          me.gaze = at ? (at.x + size.w / 2 < x0 + CLAWD_W / 2 ? -1 : 1) : partner ? (px0 < x0 ? -1 : 1) : mod(local, 20) < 10 ? -1 : 1
          headBurst()
          break
        case 'bow':
          ;[me.left, me.right] = ['down', 'down']
          if (p > 0.2 && p < 0.8) {
            me.lift = -1
            me.eyes = 'closed'
          }
          headBurst()
          break
        case 'spin':
          me.isMirror = mod(local, 6) < 3
          ;[me.left, me.right] = ['up', 'up']
          me.lift = mod(local, 6) < 3 ? 1 : 0
          headBurst()
          break
        case 'shiver':
          me.x = fit(x0 + (mod(local, 2) ? 0.5 : -0.5))
          ;[me.left, me.right] = ['down', 'down']
          headBurst()
          break
        case 'fall':
          if (p > 0.15) {
            me.isLow = true
            me.eyes = 'dizzy'
          } else [me.left, me.right] = ['up', 'up']
          headBurst()
          break
        case 'think':
          ;[me.left, me.right] = ['down', 'mid']
          me.gaze = mod(local, 30) < 15 ? -1 : 1
          headBurst()
          break
        case 'hide': {
          const q = approach(centreOn())
          if (q !== null) {
            me.isLow = true
            at!.hold = 'hide'
          }
          headBurst()
          break
        }
        case 'work':
        case 'dig':
        case 'paint': {
          const q = at ? approach(besideProp()) : 1
          if (q === null) break
          if (act.do === 'paint') [me.left, me.right] = ['out', alt ? 'mid' : 'out']
          else [me.left, me.right] = alt ? ['down', 'down'] : act.do === 'dig' ? ['mid', 'mid'] : ['out', 'out']
          if (at) me.gaze = at.x < me.x ? -1 : 1
          if (fx && at && act.do !== 'dig') bursts.push({ name: fx, x: at.x + size.w / 2, y: FLOOR - size.h - at.lift, e: local })
          else headBurst()
          break
        }
        case 'read':
        case 'eat':
        case 'hold':
        case 'blow': {
          const q = approach(at!.hold ? x0 : besideProp())
          if (q === null) break
          if (act.do === 'read') {
            ;[me.left, me.right] = ['mid', 'mid']
            at!.hold = 'front'
            Object.assign(at!, { x: me.x + CLAWD_W / 2 - size.w / 2, lift: FLOOR - (top() + 5) })
          } else if (act.do === 'hold') {
            me.right = 'up'
            holdAt('hand')
          } else {
            ;[me.left, me.right] = act.do === 'blow' ? ['mid', 'mid'] : ['out', 'mid']
            holdAt('mouth')
            if (act.do === 'eat') at!.shown = Math.max(0, 1 - q)
          }
          headBurst()
          break
        }
        case 'strum':
        case 'drum':
        case 'keys': {
          const q = approach(act.do === 'strum' ? (at!.hold === 'front' ? x0 : besideProp()) : centreOn())
          if (q === null) break
          if (act.do === 'strum') {
            me.left = 'mid'
            me.right = alt ? 'out' : 'down'
            holdAt('front')
          } else {
            // Behind drums or keys on the floor, which stand in front of him.
            at!.hold = 'front'
            ;[me.left, me.right] = act.do === 'drum' ? (mod(local, 4) < 2 ? ['up', 'down'] : ['down', 'up']) : alt ? ['down', 'out'] : ['out', 'down']
          }
          me.lift = act.do === 'strum' && mod(local, 8) < 2 ? 1 : 0
          if (fx) bursts.push({ name: fx, x: me.x + CLAWD_W / 2 + 3, y: top(), e: local })
          break
        }
        case 'cast': {
          ;[me.left, me.right] = alt ? ['out', 'up'] : ['out', 'mid']
          const aim = at ? { x: at.x + size.w / 2, y: FLOOR - size.h - at.lift } : partner ? { x: px0 + CLAWD_W / 2, y: STAND_Y } : null
          if (aim) {
            if (fx) bursts.push({ name: fx, x: aim.x, y: aim.y, e: local })
            if (partner && !busy.has(act.with!)) {
              partner.eyes = 'stars'
              partner.lift = alt ? 1 : 0
            }
            if (at && !at.hold) at.lift = 1 + Math.sin(local * 0.4)
          } else headBurst()
          me.gaze = aim ? (aim.x < me.x ? -1 : 1) : 0
          break
        }
        case 'punch':
        case 'kick': {
          const to = at ? besideProp() : partner ? besidePartner(0) : x0
          const q = approach(to)
          if (q === null) break
          const toward = (at ? at.x : px0) > me.x ? 1 : -1
          if (act.do === 'punch') [me.left, me.right] = mod(local, 4) < 2 ? ['mid', 'out'] : ['out', 'mid']
          else me.legs = mod(local, 6) < 3 ? 'kick' : 'stand'
          me.x = fit(me.x + (mod(local, 4) < 2 ? toward * 0.5 : 0))
          if (partner && !busy.has(act.with!)) {
            // The partner reels away, dizzy.
            partner.x = fit(px0 + toward * Math.min(4, q * 6))
            partner.eyes = 'dizzy'
            partner.isMirror = mod(local, 8) < 4
            if (fx) bursts.push({ name: fx, x: partner.x + CLAWD_W / 2, y: STAND_Y + 1, e: local })
          } else if (at && act.do === 'kick') {
            // The prop flies off.
            const land = toward > 0 ? Math.max(0, w - size.w - 1) : 1
            const fly = clamp01((q - 0.15) / 0.85)
            Object.assign(at, { x: lerp(at.x, land, fly), lift: Math.sin(Math.PI * fly) * 6, flip: fly < 1 && mod(local, 4) < 2 })
            if (fx && fly < 0.3) bursts.push({ name: fx, x: at.x + size.w / 2, y: FLOOR - size.h, e: local })
          } else if (at && fx) bursts.push({ name: fx, x: at.x + size.w / 2, y: FLOOR - size.h - at.lift, e: local })
          break
        }
        case 'carry':
        case 'throw': {
          const q = approach(at!.hold === 'over' ? x0 : centreOn(), 0.35)
          if (q === null) break
          if (act.do === 'carry') {
            const to = target ?? spot(w, me.x < w / 2 ? 0.8 : 0.1)
            me.x = fit(lerp(me.x, to, ease(q)))
            ;[me.left, me.right] = ['up', 'up']
            me.lift = q < 1 && step ? 1 : 0
            if (q < 1) holdAt('over')
            else Object.assign(at!, { x: me.x + CLAWD_W / 2 - size.w / 2, lift: 0, hold: null })
          } else {
            // Up, then the arc: to the partner (who catches it), to `to`, or the far side.
            const catcher = partner && !busy.has(act.with!) ? partner : null
            const land = catcher ? px0 + CLAWD_W / 2 - size.w / 2 : act.to !== null ? act.to * Math.max(0, w - size.w) : me.x < w / 2 ? Math.max(0, w - size.w - 2) : 2
            const fly = clamp01((q - 0.2) / 0.8)
            ;[me.left, me.right] = q < 0.3 ? ['up', 'up'] : ['out', 'out']
            if (q < 0.2) holdAt('over')
            else {
              const end = catcher ? OVERHEAD : 0
              const h = lerp(OVERHEAD, end, fly) + Math.sin(Math.PI * fly) * 5
              Object.assign(at!, { x: lerp(me.x + CLAWD_W / 2 - size.w / 2, land, fly), lift: h, hold: catcher && fly >= 1 ? 'over' : null, flip: fly < 1 && mod(local, 4) < 2 })
              if (catcher && fly > 0.7) [catcher.left, catcher.right] = ['up', 'up']
            }
          }
          headBurst()
          break
        }
        case 'push': {
          const q = approach(besideProp())
          if (q === null) break
          const to = target ?? spot(w, me.x < w / 2 ? 0.75 : 0.1)
          const sign = at!.x > me.x ? 1 : -1
          me.x = fit(lerp(me.x, to, ease(q)))
          me.legs = step ? 'step' : 'stand'
          if (sign > 0) me.right = 'mid'
          else me.left = 'mid'
          at!.x = sign > 0 ? me.x + CLAWD_W + 1 : me.x - size.w - 1
          headBurst()
          break
        }
        case 'ride': {
          const q = approach(at!.hold === 'ride' ? x0 : centreOn())
          if (q === null) break
          at!.hold = 'ride'
          if (target !== null) me.x = fit(lerp(me.x, target, ease(q)))
          else scrolls = true
          // Sitting in it, legs folded, the vehicle in front of him up to his middle.
          const bump = mod(local, 6) < 3 ? 0.5 : 0
          me.isLow = true
          me.lift = size.h * 0.5 + bump
          ;[me.left, me.right] = ['mid', 'mid']
          Object.assign(at!, { x: me.x + CLAWD_W / 2 - size.w / 2, lift: bump })
          headBurst()
          break
        }
        case 'fly':
        case 'swim': {
          if (target !== null) me.x = fit(lerp(x0, target, ease(p)))
          else scrolls = true
          const rise = act.do === 'fly' ? 4 : 2
          me.lift = Math.round(Math.min(1, p * 4) * rise + Math.sin(local * 0.3))
          if (act.do === 'fly') [me.left, me.right] = me.x >= x0 ? ['out', 'up'] : ['up', 'out']
          else [me.left, me.right] = alt ? ['up', 'out'] : ['out', 'up']
          if (fx) bursts.push({ name: fx, x: me.x + (me.x >= x0 ? 0 : CLAWD_W), y: top() + 2, e: local })
          break
        }
        case 'highfive':
        case 'hug': {
          const q = approach(act.do === 'hug' ? besidePartner(-3) : besidePartner(1), 0.4)
          if (q === null) break
          const right = px0 > me.x
          if (act.do === 'highfive') {
            const up = q > 0.4
            if (right) me.right = up ? 'up' : 'mid'
            else me.left = up ? 'up' : 'mid'
            if (partner && !busy.has(act.with!)) {
              if (right) partner.left = up ? 'up' : 'mid'
              else partner.right = up ? 'up' : 'mid'
              partner.gaze = right ? -1 : 1
            }
            if (up && fx) bursts.push({ name: fx, x: (me.x + px0) / 2 + CLAWD_W / 2, y: STAND_Y - 2, e: local })
          } else {
            ;[me.left, me.right] = ['out', 'out']
            me.eyes = 'happy'
            if (partner && !busy.has(act.with!)) partner.eyes = 'happy'
            if (fx) bursts.push({ name: fx, x: (me.x + px0) / 2 + CLAWD_W / 2, y: STAND_Y - 1, e: local })
          }
          me.gaze = right ? 1 : -1
          break
        }
        case 'chase':
        case 'follow': {
          const flees = act.do === 'chase' && partner && !busy.has(act.with!)
          const away = x0 < px0 ? maxX : 0
          const theirs = flees ? lerp(px0, away, ease(Math.min(1, p * 1.3))) : px0
          if (flees) {
            partner!.x = fit(theirs)
            partner!.legs = mod(local, 2) ? 'step' : 'stand'
            partner!.lift = step ? 1 : 0
            partner!.eyes = 'dizzy'
            ;[partner!.left, partner!.right] = ['up', 'up']
          }
          const gap = act.do === 'chase' ? CLAWD_W + 3 : CLAWD_W + 1
          const behind = x0 < px0 ? theirs - gap : theirs + gap
          me.x = fit(lerp(x0, behind, act.do === 'chase' ? Math.min(1, p * 1.2) : ease(p)))
          me.legs = Math.abs(me.x - x0) > 0.5 && step ? 'step' : 'stand'
          me.lift = me.legs === 'step' ? 1 : 0
          me.gaze = px0 > x0 ? 1 : -1
          if (act.do === 'chase') [me.left, me.right] = alt ? ['mid', 'down'] : ['down', 'mid']
          headBurst()
          break
        }
        // ---- poses and moves without a prop
        case 'clap':
          ;[me.left, me.right] = mod(local, 4) < 2 ? ['mid', 'mid'] : ['out', 'out']
          headBurst()
          break
        case 'point': {
          const aim = at ? at.x + size.w / 2 : partner ? px0 + CLAWD_W / 2 : target !== null ? target + CLAWD_W / 2 : null
          const left = aim !== null && aim < x0 + CLAWD_W / 2
          me.gaze = aim === null ? 0 : left ? -1 : 1
          if (left) me.left = 'mid'
          else me.right = 'mid'
          headBurst()
          break
        }
        case 'nod':
          ;[me.left, me.right] = ['down', 'down']
          me.lift = mod(local, 6) < 3 ? -1 : 0
          headBurst()
          break
        case 'refuse':
          ;[me.left, me.right] = ['mid', 'mid']
          me.gaze = mod(local, 4) < 2 ? -1 : 1
          headBurst()
          break
        case 'laugh':
          me.eyes = 'happy'
          ;[me.left, me.right] = alt ? ['mid', 'mid'] : ['down', 'down']
          me.lift = mod(local, 4) < 2 ? 1 : 0
          headBurst()
          break
        case 'cry':
          me.eyes = 'closed'
          ;[me.left, me.right] = ['mid', 'mid']
          me.x = fit(x0 + (mod(local, 4) < 2 ? 0.5 : 0))
          headBurst()
          break
        case 'stretch':
          ;[me.left, me.right] = p > 0.15 && p < 0.85 ? ['up', 'up'] : ['out', 'out']
          me.lift = p > 0.3 && p < 0.7 ? 1 : 0
          if (p > 0.3 && p < 0.7) me.eyes = 'closed'
          headBurst()
          break
        case 'sneak':
        case 'march':
        case 'crawl':
        case 'roll': {
          const to = target ?? spot(w, x0 < w / 2 ? 0.75 : 0.15)
          me.x = fit(lerp(x0, to, act.do === 'march' ? p : ease(p)))
          const moving = p < 1 && Math.abs(to - x0) > 0.5
          if (act.do === 'sneak') {
            ;[me.left, me.right] = ['mid', 'mid']
            me.legs = moving && mod(local, 8) < 4 ? 'step' : 'stand'
            me.gaze = mod(local, 16) < 8 ? -1 : 1
          } else if (act.do === 'march') {
            ;[me.left, me.right] = alt ? ['up', 'down'] : ['down', 'up']
            me.legs = moving && alt ? 'step' : 'stand'
            me.lift = moving && alt ? 1 : 0
          } else if (act.do === 'crawl') {
            me.isLow = true
            ;[me.left, me.right] = step ? ['mid', 'out'] : ['out', 'mid']
          } else {
            me.isLow = true
            ;[me.left, me.right] = ['down', 'down']
            if (moving) me.isMirror = mod(local, 4) < 2
            me.eyes = moving ? 'dizzy' : null
          }
          headBurst()
          break
        }
        case 'flip': {
          // A somersault: up, turning over at the top, down.
          const ph = mod(local, 12) / 12
          me.lift = Math.round(Math.sin(Math.PI * ph) * 6)
          me.isMirror = ph > 0.3 && ph < 0.7
          me.isLow = ph > 0.35 && ph < 0.65
          ;[me.left, me.right] = me.lift > 1 ? ['up', 'up'] : ['out', 'out']
          headBurst()
          break
        }
        case 'salute':
          ;[me.left, me.right] = ['down', 'up']
          headBurst()
          break
        case 'sing':
          ;[me.left, me.right] = alt ? ['out', 'mid'] : ['mid', 'out']
          me.lift = mod(local, 10) < 5 ? 1 : 0
          me.eyes = mod(local, 20) < 10 ? 'closed' : null
          if (fx) bursts.push({ name: fx, x: me.x + CLAWD_W / 2 + 3, y: top(), e: local })
          break
        case 'panic':
          ;[me.left, me.right] = ['up', 'up']
          me.eyes = 'dizzy'
          me.x = fit(x0 + Math.sin(local * 0.5) * 4)
          me.isMirror = Math.cos(local * 0.5) < 0
          me.legs = step ? 'step' : 'stand'
          me.lift = step ? 1 : 0
          headBurst()
          break
        case 'faint':
          if (p < 0.2) {
            me.x = fit(x0 + (mod(local, 2) ? 0.5 : -0.5))
            ;[me.left, me.right] = ['up', 'up']
          } else {
            me.isLow = true
            me.eyes = 'closed'
            ;[me.left, me.right] = ['out', 'out']
            headBurst()
          }
          break
        case 'meditate':
          me.isLow = true
          me.eyes = 'closed'
          ;[me.left, me.right] = ['out', 'out']
          me.lift = Math.round(1 + Math.min(1, p * 3) * 2 + Math.sin(local * 0.15))
          if (mod(local, 30) < 15) headBurst()
          break
        case 'teleport': {
          // Sparks, gone, then sparks where he lands.
          const to = target ?? spot(w, x0 < w / 2 ? 0.8 : 0.1)
          me.x = p < 0.4 ? x0 : fit(to)
          me.isHidden = p >= 0.3 && p < 0.5
          if (p < 0.3) me.x = fit(x0 + (mod(local, 2) ? 0.5 : -0.5))
          if (fx && p < 0.5) bursts.push({ name: fx, x: x0 + CLAWD_W / 2, y: STAND_Y + 1, e: local })
          if (fx && p >= 0.4 && p < 0.7) bursts.push({ name: fx, x: fit(to) + CLAWD_W / 2, y: STAND_Y + 1, e: local })
          break
        }
        case 'kneel': {
          const q = partner ? approach(besidePartner(1)) : at ? approach(besideProp()) : 1
          if (q === null) break
          me.isLow = true
          const right = (partner ? px0 : at ? at.x : x0 + 1) > me.x
          if (right) me.right = 'mid'
          else me.left = 'mid'
          me.gaze = right ? 1 : -1
          if (partner && !busy.has(act.with!)) {
            partner.eyes = q > 0.4 ? 'hearts' : null
            partner.gaze = right ? -1 : 1
          }
          headBurst()
          break
        }
        // ---- with a prop
        case 'juggle': {
          const q = approach(at!.hold ? x0 : centreOn())
          if (q === null) break
          // The prop goes round over his hands.
          const ph = (local % 12) / 12
          at!.hold = 'over'
          Object.assign(at!, { x: me.x + CLAWD_W / 2 - size.w / 2 + Math.cos(ph * Math.PI * 2) * 4, lift: FLOOR - top() + Math.abs(Math.sin(ph * Math.PI * 2)) * 2 })
          ;[me.left, me.right] = ph < 0.5 ? ['up', 'mid'] : ['mid', 'up']
          me.gaze = Math.cos(ph * Math.PI * 2) < 0 ? -1 : 1
          headBurst()
          break
        }
        case 'stir':
        case 'type': {
          const q = approach(centreOn())
          if (q === null) break
          // Behind a pot or a keyboard, which stands in front of him.
          at!.hold = 'front'
          if (act.do === 'stir') {
            me.left = 'down'
            me.right = (['mid', 'out', 'down', 'out'] as const)[mod(Math.floor(local / 2), 4)]!
          } else [me.left, me.right] = mod(local, 2) ? ['mid', 'down'] : ['down', 'mid']
          if (fx) bursts.push({ name: fx, x: at!.x + size.w / 2, y: FLOOR - size.h, e: local })
          break
        }
        case 'drink':
        case 'call': {
          const q = approach(at!.hold ? x0 : besideProp())
          if (q === null) break
          me.right = 'mid'
          holdAt('mouth')
          if (act.do === 'drink') {
            me.lift = mod(local, 20) < 10 ? 0 : 1
            me.eyes = mod(local, 20) < 10 ? 'closed' : 'happy'
          } else me.gaze = mod(local, 24) < 12 ? -1 : 1
          headBurst()
          break
        }
        case 'sweep': {
          const q = approach(besideProp())
          if (q === null) break
          const to = target ?? spot(w, me.x < w / 2 ? 0.75 : 0.1)
          me.x = fit(lerp(me.x, to, ease(q)))
          me.legs = step ? 'step' : 'stand'
          ;[me.left, me.right] = alt ? ['mid', 'down'] : ['down', 'mid']
          const sign = to >= x0 ? 1 : -1
          at!.hold = 'front'
          Object.assign(at!, { x: sign > 0 ? me.x + CLAWD_W - 2 + (alt ? 1 : 0) : me.x - size.w + 2 - (alt ? 1 : 0), lift: 0 })
          if (fx) bursts.push({ name: fx, x: at!.x + size.w / 2, y: FLOOR - 1, e: local })
          break
        }
        case 'climb': {
          const q = approach(centreOn())
          if (q === null) break
          // Up the side, then standing on top.
          const up = clamp01(q * 2.5)
          me.lift = Math.round(size.h * up)
          ;[me.left, me.right] = up < 1 ? (step ? ['up', 'mid'] : ['mid', 'up']) : alt ? ['up', 'up'] : ['out', 'out']
          me.legs = up < 1 && step ? 'step' : 'stand'
          if (up >= 1) headBurst()
          break
        }
        case 'photo': {
          const q = approach(at!.hold ? x0 : besideProp())
          if (q === null) break
          ;[me.left, me.right] = ['mid', 'mid']
          holdAt('front')
          Object.assign(at!, { lift: FLOOR - (top() + 5) })
          const aim = partner ? px0 : null
          if (aim !== null) me.gaze = aim < me.x ? -1 : 1
          if (partner && !busy.has(act.with!)) {
            ;[partner.left, partner.right] = q > 0.3 ? ['up', 'mid'] : ['out', 'out']
            partner.eyes = 'happy'
          }
          // The flash.
          if (fx && mod(local, 16) < 4) bursts.push({ name: fx, x: at!.x + size.w / 2, y: FLOOR - (top() + 5) - size.h, e: local })
          break
        }
        // ---- with a partner
        case 'handshake':
        case 'argue': {
          const q = approach(besidePartner(act.do === 'argue' ? 2 : 0), 0.4)
          if (q === null) break
          const right = px0 > me.x
          const free = partner && !busy.has(act.with!)
          if (act.do === 'handshake') {
            const bob = mod(local, 4) < 2 ? 'mid' : 'out'
            if (right) me.right = bob
            else me.left = bob
            if (free) {
              if (right) partner!.left = bob
              else partner!.right = bob
            }
          } else {
            ;[me.left, me.right] = alt ? ['up', 'out'] : ['out', 'up']
            me.lift = alt ? 1 : 0
            if (free) {
              ;[partner!.left, partner!.right] = alt ? ['out', 'up'] : ['up', 'out']
              partner!.lift = alt ? 0 : 1
            }
            if (fx) bursts.push({ name: fx, x: (alt ? me.x : px0) + CLAWD_W / 2, y: STAND_Y, e: local })
          }
          me.gaze = right ? 1 : -1
          if (free) partner!.gaze = right ? -1 : 1
          break
        }
        case 'lift': {
          const q = approach(px0, 0.4)
          if (q === null) break
          ;[me.left, me.right] = ['up', 'up']
          if (partner && !busy.has(act.with!)) {
            const up = clamp01(q * 3)
            partner.x = me.x
            partner.lift = Math.round(up * 5)
            ;[partner.left, partner.right] = up >= 1 ? (alt ? ['up', 'up'] : ['out', 'out']) : ['out', 'out']
            partner.eyes = 'happy'
          }
          headBurst()
          break
        }
        case 'scare': {
          const q = approach(besidePartner(1), 0.25)
          if (q === null) break
          ;[me.left, me.right] = ['up', 'up']
          me.lift = q < 0.3 ? 1 : 0
          if (partner && !busy.has(act.with!)) {
            const away = px0 > me.x ? 1 : -1
            partner.lift = Math.round(Math.max(0, Math.sin(Math.PI * clamp01(q * 2))) * 4)
            partner.x = fit(px0 + away * Math.min(3, q * 6))
            ;[partner.left, partner.right] = ['up', 'up']
            partner.eyes = 'dizzy'
            if (fx) bursts.push({ name: fx, x: partner.x + CLAWD_W / 2, y: STAND_Y - partner.lift, e: local })
          } else headBurst()
          break
        }
        case 'waltz': {
          const q = approach(besidePartner(-2), 0.3)
          if (q === null) break
          const sway = Math.sin(local * 0.2) * 4
          const right = px0 > x0
          me.x = fit(me.x + sway)
          if (right) me.right = 'mid'
          else me.left = 'mid'
          me.lift = mod(local, 6) < 3 ? 1 : 0
          me.gaze = right ? 1 : -1
          if (partner && !busy.has(act.with!)) {
            partner.x = fit(me.x + (right ? CLAWD_W - 2 : -(CLAWD_W - 2)))
            if (right) partner.left = 'mid'
            else partner.right = 'mid'
            partner.lift = me.lift
            partner.eyes = 'happy'
            partner.gaze = right ? -1 : 1
          }
          if (fx) bursts.push({ name: fx, x: me.x + CLAWD_W, y: STAND_Y - 1, e: local })
          break
        }
        // ---- a move the model made up: its poses in a loop, travelling to "to" if given
        case 'move': {
          if (!move) break
          const f = move.frames[mod(Math.floor(local / move.tempo), move.frames.length)]!
          const base = target !== null ? lerp(x0, target, ease(p)) : x0
          me.x = fit(base + f.dx)
          me.left = f.left
          me.right = f.right
          me.legs = f.legs
          me.lift = f.lift
          me.isLow = f.low
          me.isMirror = f.flip
          me.eyes = f.eyes
          headBurst()
          break
        }
      }
    }
    // The ones without an act look at whoever is doing something, and blink.
    for (const [i, a] of actors.entries()) {
      if (busy.has(i)) continue
      const doer = beat.acts.map(b => actors[b.who]!).find(o => o !== a)
      if (doer && a.gaze === 0 && !a.eyes) a.gaze = doer.x < a.x ? -1 : 1
    }
    for (const [i, a] of actors.entries()) if (a.left === 'out' && a.right === 'out' && !a.isLow && !a.eyes && mod(e + i * 11, 30) < 2) a.isBlink = true
    if (scrolls) scroll += SCROLL * local

    if (isNow) {
      for (const prop of props.values()) if (prop.shown <= 0) prop.gone = true
      return { actors, props, scroll, bursts, lines }
    }
    // What a beat leaves behind: where everyone ended up, props set down (eaten ones gone).
    actors.forEach((a, i) => (xs[i] = a.x))
    for (const prop of props.values()) {
      if (prop.shown <= 0) prop.gone = true
      Object.assign(prop, { hold: null, lift: 0, flip: false })
    }
    from += d
  }
  return { actors: xs.map(idle), props, scroll, bursts: [], lines: [] }
}

/** Where each Clawd is and how he stands at tick `t` (for the tests). */
export function castAt(skit: MuseSkit, t: number, w: number): readonly ActorAt[] {
  return momentAt(current(skit), t, w).actors
}

// ---- drawing ------------------------------------------------------------------------

/** A prop as it moves on its own at tick `t`. */
function drawProp(cv: Canvas, prop: SkitProp, at: PropAt, t: number, w: number): { x: number; top: number } | null {
  if (at.gone) return null
  const { w: pw } = sizeOf(prop)
  let dx = 0
  let lift = at.lift
  let art = frame(prop.frames, Math.floor(t / (prop.motion === 'flap' ? 2 : 4)))
  if (!at.hold && at.lift === 0) {
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
        lift += cycle < 12 ? 12 - cycle : 0
        break
      }
      case 'spin':
        if (mod(t, 6) < 3) art = art.map(r => [...r].reverse().join(''))
        break
      case 'blink':
        if (mod(t, 16) >= 12) return null
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
      case 'dance':
        lift += mod(t, 6) < 3 ? 1 : 0
        if (mod(t, 12) < 6) art = art.map(r => [...r].reverse().join(''))
        break
      case 'hop':
        lift += Math.max(0, Math.sin((mod(t, 14) / 14) * Math.PI) * 3)
        break
      case 'pace': {
        const leg = mod(t, 80)
        dx = (leg < 40 ? leg : 80 - leg) / 4 - 5
        if (leg >= 40) art = art.map(r => [...r].reverse().join(''))
        break
      }
      case 'sway':
        dx = Math.sin(t * 0.15) * 1
        break
      case 'flap':
      case 'still':
        break
    }
  }
  if (at.flip) art = art.map(r => [...r].reverse().join(''))
  if (at.shown < 1) art = art.map(r => r.slice(0, Math.ceil(r.length * at.shown)))
  const x = Math.min(Math.max(0, at.x + dx), Math.max(0, w - pw))
  const top = FLOOR - art.length / 2 - lift
  drawFine(cv, x, top, art, prop.colors)
  return { x: x + pw / 2, top }
}

/** A Clawd at a moment: his pose, low when he sits, eyes turned where he looks. */
function drawActor(cv: Canvas, skit: MuseSkit, i: number, a: ActorAt, t: number): void {
  if (a.isHidden) return
  const actor = skit.cast[i]!
  const base = actor.look
  const look = base || a.eyes ? ({ ...(base ?? { hat: [], held: [], colors: {}, shiny: false, eyes: 'normal' }), ...(a.eyes ? { eyes: a.eyes } : {}) } as MuseLook) : null
  let art = poseArt(a.left, a.right, a.legs, a.isBlink && (!look || look.eyes === 'normal'))
  if (a.isMirror) art = art.map(r => [...r].reverse().join(''))
  if (a.isLow) art = art.slice(0, 5)
  const y = (a.isLow ? STAND_Y + 2 : STAND_Y) - a.lift
  drawClawd(cv, a.x, y, art, look, t, actor.color)
  if (a.gaze !== 0 && (!look || look.eyes === 'normal') && !a.isBlink) {
    // Eyes moved a fine pixel toward what he looks at.
    for (const ex of [4, 9]) {
      for (let dy = 2; dy < 6; dy++) {
        const fy = y * 2 + dy
        const fx = (a.x + ex) * 2
        dot(cv, fx + (a.gaze > 0 ? 0 : 1), fy, actor.color)
        dot(cv, fx + (a.gaze > 0 ? 2 : -1), fy, actor.color === '#2b1d18' ? '#e9e4da' : '#2b1d18')
      }
    }
  }
}

type Fx = { glyphs: readonly string[]; colors: readonly string[]; motion: 'rise' | 'burst' | 'fall' | 'flash' | 'pop' | 'low' | 'side' }
const EFFECT: Record<string, Fx> = {
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
  impact: { glyphs: ['✸', '*'], colors: ['#ffd166', '#f7768e'], motion: 'flash' },
  dust: { glyphs: ['·', '∙', '°'], colors: ['#a08a74', '#7a6a5a'], motion: 'low' },
  thought: { glyphs: ['∘', '○', '◯'], colors: ['#c0caf5', '#a9b1d6'], motion: 'rise' },
  tears: { glyphs: ['╎', '·'], colors: ['#7dcfff', '#7aa2f7'], motion: 'fall' },
  fire: { glyphs: ['^', '∧', '*'], colors: ['#ff9e64', '#f7768e', '#ffd166'], motion: 'rise' },
  wind: { glyphs: ['≈', '~', '-'], colors: ['#a9b1d6', '#787c99'], motion: 'side' },
}

/** A glyph only where the cell is empty. */
function mark(g: Grid, x: number, row: number, text: string, style: Style): void {
  const cell = g[row]?.[Math.round(x)]
  if (cell && cell.ch === ' ') put(g, x, row, text, style)
}

/** An effect around cell column `cx`, cell row `row`, `e` ticks in. */
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
        mark(g, x - (Math.floor((e + i * 3) / 3) % 3), mod(Math.floor((e + i * 5) / 2), rows - 1), ch, { c })
      }
      break
    case 'flash':
      if (mod(e, 8) < 4) {
        const { ch, c } = pick(0)
        overlay(g, cx, Math.max(0, row), ch, { c, b: true })
        mark(g, cx - 2, Math.max(0, row - 1), pick(1).ch, { c: pick(1).c })
      }
      break
    case 'pop': {
      // Over his head, whatever is drawn there.
      const { ch, c } = pick(0)
      if (mod(e, 10) < 7) overlay(g, cx + 5, Math.max(0, row - 1), ch, { c, b: true })
      break
    }
    case 'low':
      for (let i = 0; i < 3; i++) {
        const age = mod(e + i * 4, 12)
        const { ch, c } = pick(i)
        mark(g, cx - 6 + i * 6 + (age >> 2) * (i - 1), rows - 2, ch, { c, d: age > 7 })
      }
      break
    case 'side':
      for (let i = 0; i < 3; i++) {
        const age = mod(e + i * 3, 9)
        const { ch, c } = pick(i)
        mark(g, cx - 2 - age, Math.min(rows - 2, row + i - 1), ch, { c, d: age > 5 })
      }
      break
  }
}

/** What a Clawd says, beside his head: right of him when it fits, else left. */
function speech(g: Grid, text: string, x: number, row: number): void {
  const w = g[0]!.length
  const width = textWidth(text) + 2
  const right = Math.round(x + CLAWD_W + 1)
  const at = right + width <= w ? right : Math.max(0, Math.round(x) - width - 1)
  overlay(g, at, row, `“${text}”`, { c: '#e9e4da' })
}

/** The skit at tick `t` (from its start) on a stage `w` cells wide. */
export function skitScene(raw: MuseSkit, t: number, w: number, seed = 0): Grid {
  const skit = current(raw)
  const cv = canvas(w, STAGE_ROWS)
  const place = skit.place
  const m = momentAt(skit, Math.min(t, skitLength(skit) - 1), w)
  if (place) {
    skyBody(cv, place, 1)
    backdrop(cv, place, m.scroll * 0.4, FLOOR - 1, 0, t)
    ground(cv, m.scroll, FLOOR, 1, place.backdrop === 'road' ? ROAD : [place.colors.ground, place.colors.near, place.colors.ground])
  } else ground(cv, m.scroll, FLOOR, 1, WOOD)
  // Props behind the cast, then the cast (whoever acts in front), then the props they hold or stand behind.
  const spots = new Map<string, { x: number; top: number }>()
  const front = (at: PropAt) => at.hold !== null
  for (const prop of skit.props) {
    const at = m.props.get(prop.id)!
    if (front(at)) continue
    const s = drawProp(cv, prop, at, t, w)
    if (s) spots.set(prop.id, s)
  }
  // Speakers in front; someone held up over another in front of him.
  const rank = (i: number) => Number(m.lines.some(l => l.who === i)) + (m.actors[i]!.lift >= 3 ? 2 : 0)
  const order = m.actors.map((_, i) => i).sort((a, b) => rank(a) - rank(b))
  for (const i of order) drawActor(cv, skit, i, m.actors[i]!, t)
  for (const prop of skit.props) {
    const at = m.props.get(prop.id)!
    if (!front(at)) continue
    const s = drawProp(cv, prop, at, t, w)
    if (s) spots.set(prop.id, s)
  }

  const g = cells(cv)
  if (place) weather(g, place, t, seed)
  else glyphStars(g, t, Math.floor(w / 5), 0.03, ['·', '✻'], ['#8a6a5c', '#a97c68', '#6b5248'], 3)
  // Effects the props keep going.
  for (const prop of skit.props) {
    const s = spots.get(prop.id)
    if (s && prop.effect !== 'none') effect(g, prop.effect, s.x, Math.max(0, Math.floor(s.top / 2)), t)
  }
  for (const b of m.bursts) effect(g, b.name, b.x, Math.max(0, Math.floor(b.y / 2)), b.e)
  // Who is who at the start, when there is more than one (under their lines).
  if (t < TITLE_TICKS && skit.cast.length > 1) {
    for (const [i, a] of m.actors.entries()) overlay(g, Math.round(a.x + CLAWD_W / 2 - textWidth(skit.cast[i]!.name) / 2), 1, skit.cast[i]!.name, { c: skit.cast[i]!.color, d: true })
  }
  // Lines: a second speaker one row lower, so both read.
  const used = new Set<number>()
  for (const l of m.lines) {
    const a = m.actors[l.who]!
    let row = Math.max(0, Math.floor((STAND_Y - a.lift) / 2))
    while (used.has(row) && row < STAGE_ROWS - 2) row++
    used.add(row)
    speech(g, l.say, a.x, row)
  }
  if (t < TITLE_TICKS) {
    overlay(g, 1, 0, `▸ ${skit.title}`, { c: place?.colors.accent ?? '#e9b49a', d: t > TITLE_TICKS - 6 })
  }
  return g
}
