// The companion: a pixel pet four rows tall (the top row for its hat), drawn
// the same wherever it stands (right-aligned above the prompt). Each turn it
// wears an outfit drawn at random: a built-in hat or held thing, or one from a
// look the muse wrote for a skit.
// Clawd's body and where his eyes sit; blinking, breathing, the expressions
// and the props beside him are drawn from those.
import { canvas, cells, draw, drawFine, mod, noise, plot, segments } from './cells'
import type { Canvas, Grid } from './cells'
import type { Muse, MuseLook } from './muse'
import type { DockPet } from './types'
import type { Act, Mood } from './themes'

export type PetState = Act | Mood

export type PetArt = {
  /** The body, 5 px tall: letters keyed in `colors`, `.` clear. Up to BODY_W wide. */
  body: readonly string[]
  /** The same body with its feet moved: a step while it works. */
  step?: readonly string[]
  colors: Record<string, string>
  /** Each eye's column in the body; an eye is 1 px wide, 2 px tall, from row `eyeRow`. */
  eyes: readonly number[]
  eyeRow: number
  /** The pupils' color, and the body's color where an eye closes. */
  eye: string
  lid: string
  /** The mouth's column and row, opened while it talks. */
  mouth?: readonly [x: number, y: number]
  /** Its cheeks' color when happy. */
  blush?: string
  /** Props beside it: sparks while a tool runs, dots while it thinks. */
  spark: string
}

/** Columns the pet takes: its props on the left, its body on the right. */
export const PROP_W = 4
export const BODY_W = 12
export const PET_W = PROP_W + BODY_W
export const PET_ROWS = 4
/** Pixels above the body for a hat: everything else is drawn this much lower. */
const HEADROOM = 2
/** Milliseconds per frame of the pet. */
export const PET_MS = 140

const QUESTION = ['.YY.', '...Y', '..Y.', '....', '..Y.']
const HEART = ['P.P', 'PPP', '.P.']
const ZED = ['ZZZZ', '..Z.', '.Z..', 'ZZZZ']
const STAR = ['.S.', 'SSS', '.S.']

/** Frames in one loop of a state: long enough for a blink and a breath. */
export function loopOf(state: PetState): number {
  return state === 'sleep' ? 48 : state === 'think' || state === 'tool' || state === 'say' ? 24 : 40
}

/** The pet at tick `t` in `state`, `hearts` frames into a pat (0: none). */
export function petFrame(art: PetArt, state: PetState, t: number, hearts = 0, outfit: Outfit | null = null): Grid {
  const cv = canvas(PET_W, PET_ROWS, HEADROOM)
  const isBusy = state === 'tool' || state === 'say' || state === 'think'
  // Breathing: up a pixel for part of each beat, quicker while it works; a hop when happy.
  const beat = isBusy ? 6 : 16
  let lift = mod(t, beat) < beat / 2 ? 1 : 0
  if (state === 'ready' || state === 'hello') lift = mod(t, 10) < 2 ? 1 : lift
  if (state === 'sleep' || state === 'error') lift = 0
  const y = 1 - lift
  const isStep = (state === 'tool' || state === 'say') && mod(t, 4) < 2
  const body = isStep && art.step ? art.step : art.body
  const colors = state === 'error' ? desaturate(art.colors) : art.colors
  draw(cv, PROP_W, y, body, colors)
  drawFace(cv, art, state, t, y)
  if (outfit) wear(cv, outfit, y, state)
  drawProps(cv, art, state, t)
  if (hearts > 0) {
    const rise = Math.min(4, hearts >> 1)
    draw(cv, 0, Math.max(0, 3 - rise), HEART, { P: hearts % 4 < 2 ? '#ff6b9d' : '#ff8fab' })
    if (hearts > 3) draw(cv, PROP_W + BODY_W - 3, Math.max(0, 2 - (rise >> 1)), HEART, { P: '#ff8fab' })
  }
  return cells(cv)
}

// ---- outfits ----------------------------------------------------------------------

/** What the pet wears: a hat on its head and a thing in its hand, fine pixels (two characters a pixel). */
export type Outfit = { key: string; hat: readonly string[]; held: readonly string[]; colors: Record<string, string> }

/** The tallest hat that fits above its head, in fine pixels. */
const PET_HAT_H = HEADROOM * 2 + 2

const HATS: Record<string, { art: string[]; colors: Record<string, string> }> = {
  party: { art: ['.......CC.......', '......AAAA......', '.....ABBAAA.....', '....AAAABBAA....', '...ABBAAAAABB...', '..AAAAABBAAAAA..'], colors: { A: '#ff6b9d', B: '#ffd166', C: '#ffffff' } },
  crown: { art: ['.Y.....YY.....Y.', '.YY...YYYY...YY.', '.YYYYYYRRYYYYYY.', '.YYYYYYYYYYYYYY.'], colors: { Y: '#ffd166', R: '#f7768e' } },
  beanie: { art: ['.......WW.......', '.....BBBBBB.....', '...BBBBBBBBBB...', '..BBBBBBBBBBBB..', '..SSSSSSSSSSSS..'], colors: { B: '#7aa2f7', S: '#c0caf5', W: '#ffffff' } },
  tophat: { art: ['....KKKKKKKK....', '....KKKKKKKK....', '....KKKKKKKK....', '....RRRRRRRR....', '..KKKKKKKKKKKK..'], colors: { K: '#24283b', R: '#f7768e' } },
  headphones: { art: ['.....GGGGGGGGGGGGGG.....', '...GG..............GG...', '..G..................G..', '.G....................G.', 'PPP..................PPP', 'PPP..................PPP'], colors: { G: '#9aa5ce', P: '#bb9af7' } },
  flower: { art: ['......FFF.......', '.....FFYFF......', '......FFF.......', '.......G..GG....', '.......GGG......', '.......G........'], colors: { F: '#ff8fab', Y: '#ffd166', G: '#9ece6a' } },
  chef: { art: ['....WWW.WWW.....', '...WWWWWWWWWW...', '...WWWWWWWWWW...', '....WWWWWWWW....', '....EEEEEEEE....', '....WWWWWWWW....'], colors: { W: '#f5f5f5', E: '#c0caf5' } },
}
const HELD: Record<string, { art: string[]; colors: Record<string, string> }> = {
  // Their own color letters: an outfit may pair one with a hat.
  coffee: { art: ['.V..V.', '..V..V', 'MMMMM.', 'MTTTMM', 'MMMMM.', '.MMM..'], colors: { M: '#f5f5f5', T: '#8b5a2b', V: '#a9b1d6' } },
  wand: { art: ['...X..', '..XXX.', '...X..', '..N...', '.N....', 'N.....'], colors: { X: '#ffd166', N: '#8b5a2b' } },
}
/** Built-in outfits, one per hat and one per held thing; plain Clawd now and then too. */
export const OUTFITS: readonly Outfit[] = [
  ...Object.entries(HATS).map(([key, h]) => ({ key, hat: h.art, held: [], colors: h.colors })),
  ...Object.entries(HELD).map(([key, h]) => ({ key, hat: [], held: h.art, colors: h.colors })),
  { key: 'party+coffee', hat: HATS.party!.art, held: HELD.coffee!.art, colors: { ...HATS.party!.colors, ...HELD.coffee!.colors } },
  { key: 'tophat+wand', hat: HATS.tophat!.art, held: HELD.wand!.art, colors: { ...HATS.tophat!.colors, ...HELD.wand!.colors } },
  { key: 'plain', hat: [], held: [], colors: {} },
]

/** A look the muse wrote, as the pet wears it: its hat only if it fits above the head. */
function outfitOf(look: MuseLook, key: string): Outfit | null {
  const hat = look.hat.length <= PET_HAT_H ? look.hat : []
  return hat.length || look.held.length ? { key, hat, held: look.held, colors: look.colors } : null
}

/** The outfit for a turn's seed: a built-in one, or about half the time one from the skits' looks. */
export function outfitFor(seed: number, muse?: Muse): Outfit {
  const looks = (muse?.skits ?? [])
    .flatMap((s, i) => (s.cast ?? []).flatMap((c, j) => (c.look ? [outfitOf(c.look, `muse:${i}:${j}:${s.title}`)] : [])))
    .filter((o): o is Outfit => o !== null)
  const salt = seed % 9973
  if (looks.length > 0 && noise(salt + 0.3) < 0.5) return looks[Math.floor(noise(salt * 7 + 0.1) * looks.length)]!
  return OUTFITS[Math.floor(noise(salt * 3 + 0.7) * OUTFITS.length)]!
}

/** The outfit on the pet, its body's top at `y`: the hat centred on its head, the held thing at its left arm. */
function wear(cv: Canvas, outfit: Outfit, y: number, state: PetState): void {
  if (outfit.hat.length) {
    const w = Math.max(...outfit.hat.map(r => r.length))
    drawFine(cv, PROP_W + (BODY_W * 2 - w) / 4, Math.max(-HEADROOM, y - outfit.hat.length / 2), outfit.hat, outfit.colors)
  }
  // Put away while it sleeps or is upset.
  if (outfit.held.length && state !== 'sleep' && state !== 'error' && state !== 'aborted') {
    const w = Math.max(...outfit.held.map(r => r.length))
    drawFine(cv, PROP_W - w / 2 + 0.5, y + 3 - outfit.held.length / 2, outfit.held, outfit.colors)
  }
}

function drawFace(cv: Canvas, art: PetArt, state: PetState, t: number, y: number): void {
  const top = y + art.eyeRow
  // A blink every few seconds, two frames long, at a different beat per eye pair.
  const isBlink = mod(t, 28) < 2 && state !== 'sleep'
  const lookAside = state === 'think' && mod(t, 24) >= 12 ? 1 : 0
  for (const ex of art.eyes) {
    const x = PROP_W + ex
    // Clear the eye's two pixels to the lid first, then draw what this state shows.
    plot(cv, x, top, art.lid)
    plot(cv, x, top + 1, art.lid)
    if (state === 'sleep' || isBlink || state === 'aborted') {
      plot(cv, x, top + 1, art.eye)
    } else if (state === 'ready' || state === 'hello') {
      // Eyes curved up: the top pixel alone.
      plot(cv, x, top, art.eye)
    } else if (state === 'error') {
      plot(cv, x, top, '#e63946')
      plot(cv, x, top + 1, '#e63946')
    } else {
      plot(cv, x + lookAside, top, art.eye)
      plot(cv, x + lookAside, top + 1, art.eye)
    }
    if ((state === 'ready' || state === 'hello') && art.blush) {
      plot(cv, x + (ex < BODY_W / 2 ? -1 : 1), top + 1, art.blush)
    }
  }
  if (state === 'aborted') {
    // A tear under the first eye, falling.
    const ex = PROP_W + art.eyes[0]!
    plot(cv, ex, top + 2 + (mod(t, 8) < 4 ? 0 : 1), '#7ec8e3')
  }
  if (art.mouth && (state === 'say' || state === 'ask') && mod(t, 4) < 2) {
    const [mx, my] = art.mouth
    plot(cv, PROP_W + mx, y + my, art.eye)
    plot(cv, PROP_W + mx + 1, y + my, art.eye)
  }
}

function drawProps(cv: Canvas, art: PetArt, state: PetState, t: number): void {
  if (state === 'think') {
    // Three dots rising one after another.
    for (let i = 0; i < 3; i++) {
      const p = mod(t - i * 4, 12)
      if (p < 6) plot(cv, 1 + i, 5 - p, i === 2 ? art.spark : '#8a8a8a')
    }
  } else if (state === 'tool') {
    // Sparks flying off where it works.
    for (let i = 0; i < 4; i++) {
      if (noise(i * 31 + Math.floor(t / 2)) < 0.55) plot(cv, Math.floor(noise(i + t) * PROP_W), 1 + Math.floor(noise(i * 7 + t) * 4), i % 2 ? art.spark : '#ffd166')
    }
  } else if (state === 'ask') {
    if (mod(t, 8) < 6) draw(cv, 0, 0, QUESTION, { Y: '#ffd166' })
  } else if (state === 'sleep') {
    const p = mod(t, 24)
    draw(cv, 0, Math.max(0, 2 - (p >> 3)), ZED, { Z: p < 16 ? '#8d99ae' : '#5c677d' })
  } else if (state === 'ready' || state === 'hello') {
    if (mod(t, 20) < 10) draw(cv, 0, mod(t, 20) < 5 ? 1 : 2, STAR, { S: art.spark })
  }
}

function desaturate(colors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(colors).map(([k, hex]) => [k, gray(hex)]))
}

function gray(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const l = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.7)
  const h = l.toString(16).padStart(2, '0')
  return `#${h}${h}${h}`
}

// ---- the pets ------------------------------------------------------------------

/** Clawd, as Claude Code draws him: a warm orange body, arms out, four legs. */
export const CLAWD_PET: PetArt = {
  body: [
    '.LLOOOOOOOO.',
    '.OOOOOOOOOO.',
    'OOOOOOOOOOOO',
    '.DOOOOOOOOD.',
    '..D.D..D.D..',
  ],
  step: [
    '.LLOOOOOOOO.',
    '.OOOOOOOOOO.',
    'OOOOOOOOOOOO',
    '.DOOOOOOOOD.',
    '.D.D....D.D.',
  ],
  colors: { O: '#d77757', L: '#e8957a', D: '#a9553b' },
  eyes: [3, 8],
  eyeRow: 1,
  eye: '#2b1d18',
  lid: '#d77757',
  mouth: [5, 3],
  blush: '#f2a28c',
  spark: '#f4a261',
}

/** One loop of the pet in `state` as DockPet data: distinct frames and their order. */
export function dockPetOf(
  art: PetArt,
  state: PetState,
  view: Pick<DockPet, 'id' | 'bubble' | 'tone' | 'stats'>,
  isPatted = false,
  isStill = false,
  outfit: Outfit | null = null,
): DockPet {
  const frames: DockPet['frames'] = []
  const seen = new Map<string, number>()
  const order: number[] = []
  // Still: the loop's first frame alone, which the player never has to redraw.
  const loop = isStill ? 1 : loopOf(state)
  for (let t = 0; t < loop; t++) {
    // A pat floats hearts over the first frames of the loop.
    const rows = petFrame(art, state, t, isPatted && t < 16 ? t + 1 : 0, outfit).map(row => segments(row).map(plainSeg))
    const key = JSON.stringify(rows)
    let at = seen.get(key)
    if (at === undefined) {
      at = frames.length
      frames.push(rows)
      seen.set(key, at)
    }
    order.push(at)
  }
  return { ...view, frames, order, ms: PET_MS, width: PET_W }
}

/** A run as plain data: a key left undefined is refused in state and Client props. */
function plainSeg(seg: ReturnType<typeof segments>[number]): DockPet['frames'][number][number][number] {
  return Object.fromEntries(Object.entries(seg).filter(([, v]) => v !== undefined)) as DockPet['frames'][number][number][number]
}
