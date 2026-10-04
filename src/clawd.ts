// The workbench (one of the show's two places, show.ts): Claude's mascot
// wanders in (walking, on a skateboard, or carrying a parcel), stops somewhere
// along the floor and gets to work. What he does
// there is a vignette drawn at random from a pool that fits the turn: the tool
// running (searching, editing, a shell command, subagents), thinking, writing
// or asking. Long stops switch vignettes every SEGMENT ticks.
//
// Ideas from fan Clawd animations: zhanbodev/clawd-spinner (a laptop, a page,
// a magnifier per tool) and crashchen/cc-gifs (a scene per spinner verb:
// Brewing, Tinkering, Cultivating, Catapulting…). The art here is our own.
import { canvas, cells, draw, frame, mod, noise, plot, put } from './cells'
import type { Canvas, Grid } from './cells'
import type { Muse, MuseVignette } from './muse'
import { SCENE_ROWS, glyphStars, ground } from './scenes'
import type { Act } from './themes'

const CLAUDE = '#d77757'
const CLAWD = {
  stand: ['..LLOOOOOOOO..', '..OOEOOOOEOO..', '..OOEOOOOEOO..', 'OOOOOOOOOOOOOO', '..OOOOOOOOOO..', '..DDDDDDDDDD..', '...D.D..D.D...'],
  step: ['..LLOOOOOOOO..', '..OOEOOOOEOO..', '..OOEOOOOEOO..', 'OOOOOOOOOOOOOO', '..OOOOOOOOOO..', '..DDDDDDDDDD..', '..D.D....D.D..'],
  blink: ['..LLOOOOOOOO..', '..OOOOOOOOOO..', '..OOEOOOOEOO..', 'OOOOOOOOOOOOOO', '..OOOOOOOOOO..', '..DDDDDDDDDD..', '...D.D..D.D...'],
  work: ['..LLOOOOOOOO..', '..OOEOOOOEOO..', '..OOEOOOOEOO..', '.OOOOOOOOOOOOO', 'O.OOOOOOOOOO.O', '..DDDDDDDDDD..', '...D.D..D.D...'],
  /** Arms up: a reach, a throw, a cheer. */
  up: ['O.LLOOOOOOOO.O', 'O.OOEOOOOEOO.O', '.OOOEOOOOEOOO.', '..OOOOOOOOOO..', '..OOOOOOOOOO..', '..DDDDDDDDDD..', '...D.D..D.D...'],
}
const CLAWD_W = 14
const CLAWD_COLORS = { O: CLAUDE, L: '#eb9b80', D: '#b05d42', E: '#2b1d18' }
const CODE = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff']
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const WOOD = '#6b4f43'

/** Ticks Clawd stays put each lap, and how long one vignette lasts. */
const STOP = 120
const SEGMENT = 40
/** Columns the vignettes may use to his right. */
const BENCH_W = 12

type Pose = 'stand' | 'work' | 'up' | 'dance'

/** One thing Clawd does at his stop: pixels before the canvas becomes cells, glyphs after. */
type Vignette = {
  name: string
  pose: Pose
  /** `b`: the bench's left column; `e`: ticks into this vignette; `x`: Clawd's column. */
  px?: (cv: Canvas, b: number, e: number, t: number, x: number) => void
  glyph?: (g: Grid, b: number, e: number, t: number, x: number) => void
}

/** A glyph where nothing is drawn yet. */
function mark(g: Grid, x: number, row: number, text: string, style: Parameters<typeof put>[4]): void {
  const cell = g[row]?.[Math.round(x)]
  if (cell && cell.ch === ' ') put(g, x, row, text, style)
}

// ---- vignettes ----------------------------------------------------------------

/** At a laptop, code scrolling on its screen and tokens bubbling up. */
const laptop: Vignette = {
  name: 'laptop',
  pose: 'work',
  px(cv, b, _e, t) {
    draw(cv, b, 4, ['.SSSSSS', '.S....S', '.S....S', 'KKKKKKK'], { S: '#3b3f51', K: '#565f89' })
    for (let r = 5; r <= 6; r++) {
      for (let c = 2; c <= 5; c++) {
        const lit = noise(r * 7 + c + Math.floor(t / 2) * 3) > 0.35
        plot(cv, b + c, r, lit ? CODE[(r + c + Math.floor(t / 2)) % CODE.length]! : '#1f2335')
      }
    }
  },
  glyph(g, b, _e, t) {
    const tokens = ['{', '}', ';', '<', '>', '/', '=', '0', '1', '(', ')']
    for (let k = 0; k < 3; k++) {
      const age = mod(t + k * 5, 12)
      const lap = Math.floor((t + k * 5) / 12)
      mark(g, b + 1 + mod(k * 3 + lap * 2, 6), age < 6 ? 1 : 0, frame(tokens, lap * 3 + k), { c: CODE[(k + lap) % CODE.length], d: age >= 9 })
    }
  },
}

/** Code blocks stacking up on the bench and sliding away. */
const blocks: Vignette = {
  name: 'blocks',
  pose: 'work',
  px(cv, b, _e, t) {
    for (let i = 0; i < 4; i++) {
      const age = mod(t - i * 6, 24)
      draw(cv, b + 2 + Math.floor(age / 2), 5 - (i % 2), ['BBB'], { B: CODE[(i + Math.floor(t / 24)) % CODE.length]! })
    }
    draw(cv, b, 6, ['TTTTTTTT', '.T....T.'], { T: WOOD })
  },
}

/** Hammering a glowing ingot on an anvil, sparks flying. */
const anvil: Vignette = {
  name: 'anvil',
  pose: 'work',
  px(cv, b, _e, t) {
    draw(cv, b + 1, 4, ['AAAAAAA', '.AAAAA.', '..AAA..', '.AAAAA.'], { A: '#6c7086' })
    draw(cv, b + 3, 3, ['RRR'], { R: mod(t, 4) < 2 ? '#ff7b39' : '#ffb347' })
    const isDown = mod(t, 4) < 2
    if (isDown) draw(cv, b + 2, 1, ['.MM', '.MM', 'H..'], { M: '#adb5bd', H: '#8b5e3c' })
    else draw(cv, b, 0, ['MM.', 'MM.', '..H'], { M: '#adb5bd', H: '#8b5e3c' })
  },
  glyph(g, b, _e, t) {
    if (mod(t, 4) >= 2) return
    const sparks = ['✦', '*', '·', '✧']
    for (let k = 0; k < 3; k++) mark(g, b + 5 + k + mod(t, 3), mod(k + t, 2), frame(sparks, t + k), { c: k % 2 ? '#ffd166' : '#ff9e64', b: true })
  },
}

/** Stirring a bubbling cauldron over a fire, steam curling up. */
const cauldron: Vignette = {
  name: 'cauldron',
  pose: 'work',
  px(cv, b, _e, t) {
    const brew = frame(['#9ece6a', '#73daca', '#b9f27c'], t >> 2)
    draw(cv, b + 1, 3, ['B.....B', 'BLLLLLB', 'BBBBBBB', '.BBBBB.'], { B: '#3b3b4f', L: brew })
    for (let x = 0; x < 7; x++) if (noise(x + Math.floor(t / 2) * 11) > 0.4) plot(cv, b + 1 + x, 7, noise(x * 3 + t) > 0.5 ? '#ff9e64' : '#f7768e')
    for (let k = 0; k < 3; k++) {
      const age = mod(t + k * 3, 8)
      plot(cv, b + 2 + mod(k * 2 + Math.floor((t + k * 3) / 8), 5), 3 - Math.floor(age / 2), brew)
    }
    // The spoon, swinging.
    plot(cv, b + (mod(t, 6) < 3 ? 2 : 4), 2, WOOD)
    plot(cv, b + 3, 1, WOOD)
  },
  glyph(g, b, _e, t) {
    mark(g, b + 2 + mod(t >> 1, 4), 0, frame(['°', '∘', '˚'], t >> 1), { c: '#a9b1d6', d: true })
  },
}

/** Two gears turning against each other. */
const gears: Vignette = {
  name: 'gears',
  pose: 'work',
  px(cv, b, _e, t) {
    const A = ['.G.G.', 'GGGGG', '.GHG.', 'GGGGG', '.G.G.']
    const B = ['G.G.G', '.GGG.', 'GGHGG', '.GGG.', 'G.G.G']
    const turn = mod(t, 4) < 2
    draw(cv, b + 1, 3, turn ? A : B, { G: '#e0af68', H: '#3b3b4f' })
    draw(cv, b + 5, 0, turn ? B : A, { G: '#a9b1d6', H: '#3b3b4f' })
  },
  glyph(g, b, _e, t) {
    if (mod(t, 10) < 3) mark(g, b + 10, 1, '⁂', { c: '#e0af68', d: true })
  },
}

/** Watering a sprout in a pot until it flowers. */
const plant: Vignette = {
  name: 'plant',
  pose: 'work',
  px(cv, b, e, t) {
    draw(cv, b + 3, 6, ['PPPP', '.PP.'], { P: '#c0683f' })
    const height = Math.min(5, Math.floor(e / 6))
    for (let i = 0; i < height; i++) plot(cv, b + 4 + (i % 2), 5 - i, '#9ece6a')
    if (height >= 2) plot(cv, b + 3, 6 - height + 1, '#73daca')
    if (height >= 4) plot(cv, b + 6, 6 - height + 2, '#73daca')
    if (height >= 5) draw(cv, b + 4, 0, ['FF'], { F: frame(['#ff8fab', '#f7768e'], t >> 2) })
    // The can's spout, and drops.
    draw(cv, b, 2, ['CC', 'CCC'], { C: '#7aa2f7' })
    if (height < 5) for (let k = 0; k < 2; k++) plot(cv, b + 3 + k, 4 + mod(t + k * 2, 2), '#7dcfff')
  },
}

/** A magnifier sweeping over a page until something turns up. */
const search: Vignette = {
  name: 'search',
  pose: 'stand',
  px(cv, b, _e, t) {
    draw(cv, b + 1, 2, ['FFFFF', 'FDDDF', 'FFFFF', 'FDDFF', 'FFFFF', 'FDDDF'], { F: '#e9e4d0', D: '#9a9480' })
    const lx = b + mod(Math.floor(t / 3), 5)
    const ly = 1 + (mod(Math.floor(t / 15), 2) ? 2 : 0)
    draw(cv, lx, ly, ['.OO.', 'O..O', 'O..O', '.OO.'], { O: '#7dcfff' })
    plot(cv, lx + 4, ly + 4, '#8b5e3c')
  },
  glyph(g, b, e) {
    const found = mod(e, 20) >= 14
    mark(g, b + 8, 0, found ? '!' : '?', { c: found ? '#ffd166' : '#a9b1d6', b: found })
  },
}

/** Juggling three balls. */
const juggle: Vignette = {
  name: 'juggle',
  pose: 'up',
  px(cv, b, _e, t) {
    for (let k = 0; k < 3; k++) {
      const p = mod(t + k * 6, 18) / 18
      plot(cv, b - 1 + p * 8, 5 - Math.sin(p * Math.PI) * 5, CODE[k]!)
    }
  },
}

/** Counting down and launching a little rocket. */
const rocket: Vignette = {
  name: 'rocket',
  pose: 'stand',
  px(cv, b, e, t) {
    draw(cv, b + 2, 7, ['PPPPP'], { P: '#565f89' })
    const c = mod(e, SEGMENT)
    const lift = c < 18 ? 0 : (c - 18) * 1.5
    const y = 2 - lift
    draw(cv, b + 3, y, ['.R.', 'WWW', 'WBW', 'WWW', 'F.F'], { R: '#f7768e', W: '#e9e4d0', B: '#7dcfff', F: '#f7768e' })
    if (c >= 15 && y > -8) for (let k = 0; k < 3; k++) plot(cv, b + 3 + k, y + 5 + (noise(k + t) > 0.5 ? 1 : 0), noise(k * 3 + t) > 0.5 ? '#ffd166' : '#ff9e64')
    if (c >= 18) for (let k = 0; k < 2; k++) plot(cv, b + 1 + k * 5, 6 - mod(t + k, 2), '#565f89')
  },
  glyph(g, b, e) {
    const c = mod(e, SEGMENT)
    if (c < 18) mark(g, b + 8, 1, String(3 - Math.floor(c / 6)), { c: '#ffd166', b: true })
    else if (c < 26) mark(g, b + 8, 1, '!', { c: '#f7768e', b: true })
  },
}

/** Stacking bricks into a tower, which wobbles and comes down. */
const tower: Vignette = {
  name: 'tower',
  pose: 'work',
  px(cv, b, e, t) {
    const n = Math.min(7, Math.floor(mod(e, SEGMENT) / 4))
    const wobble = n === 7 && mod(t, 2) === 0 ? 1 : 0
    for (let i = 0; i < n; i++) draw(cv, b + 2 + (i % 2) + (i > 3 ? wobble : 0), 7 - i, ['BBB'], { B: CODE[i % CODE.length]! })
  },
}

/** Fishing in a little pond; now and then, a bite. */
const fishing: Vignette = {
  name: 'fishing',
  pose: 'stand',
  px(cv, b, e, t) {
    for (let x = 1; x < 10; x++) plot(cv, b + x, 7, noise(x + (t >> 2)) > 0.7 ? '#7dcfff' : '#3d59a1')
    for (let i = 0; i < 3; i++) plot(cv, b - 1 + i, 3 - i, WOOD)
    for (let y = 1; y < 6; y++) plot(cv, b + 2, y, '#565f89')
    const bite = mod(e, SEGMENT) >= 28 && mod(e, SEGMENT) < 34
    plot(cv, b + 2, bite ? 7 : 6 - (mod(t, 6) < 3 ? 0 : 1), '#f7768e')
    if (bite) draw(cv, b + 5, 4 - mod(t, 2), ['FF.', '.FF'], { F: '#ff9e64' })
  },
  glyph(g, b, e) {
    if (mod(e, SEGMENT) >= 28 && mod(e, SEGMENT) < 34) mark(g, b + 4, 0, '!', { c: '#ffd166', b: true })
  },
}

/** A light bulb flickering, then switching on. */
const bulb: Vignette = {
  name: 'bulb',
  pose: 'stand',
  px(cv, b, e, t) {
    const c = mod(e, 20)
    const lit = c > 12 || (c > 8 && mod(t, 2) === 0)
    draw(cv, b + 2, 1, ['.YYY.', 'YYYYY', 'YYYYY', '.YYY.', '..S..', '.SSS.'], { Y: lit ? '#ffd166' : '#5c5340', S: '#a9b1d6' })
  },
  glyph(g, b, e) {
    if (mod(e, 20) <= 12) return
    mark(g, b + 1, 0, '·', { c: '#ffd166' })
    mark(g, b + 8, 0, '✦', { c: '#ffd166', b: true })
    mark(g, b + 8, 1, '·', { c: '#ffd166' })
  },
}

/** Reading an open book, its pages turning. */
const book: Vignette = {
  name: 'book',
  pose: 'stand',
  px(cv, b, _e, t) {
    draw(cv, b + 1, 4, ['PPPP.PPPP', 'PDDP.PDDP', 'PPPPPPPPP', '.BBBBBBB.'], { P: '#e9e4d0', D: '#9a9480', B: '#7a3b3b' })
    const turn = mod(t, 12)
    if (turn < 6) plot(cv, b + 2 + turn, 3 + Math.abs(3 - turn) / 2, '#ffffff')
  },
}

/** Peering through a telescope at the stars. */
const telescope: Vignette = {
  name: 'telescope',
  pose: 'stand',
  px(cv, b) {
    for (let i = 0; i < 5; i++) {
      plot(cv, b + 1 + i, 5 - i, '#a9b1d6')
      plot(cv, b + 1 + i, 6 - i, '#a9b1d6')
    }
    plot(cv, b + 6, 0, '#7dcfff')
    draw(cv, b + 1, 6, ['T.T', 'T.T'], { T: WOOD })
  },
  glyph(g, b, _e, t) {
    mark(g, b + 8, 0, frame(['✦', '✧', '·', '✧'], t >> 1), { c: '#ffd166', b: true })
    mark(g, b + 10, 1, frame(['·', '✦', '·'], (t >> 1) + 1), { c: '#bb9af7' })
  },
}

/** Writing on a scroll, line by line. */
const quill: Vignette = {
  name: 'quill',
  pose: 'work',
  px(cv, b, e) {
    draw(cv, b + 1, 1, ['SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'RRRRRRR'], { S: '#e9d8a6', R: '#b08d57' })
    const written = mod(e, SEGMENT)
    for (let k = 0; k < 3; k++) {
      const len = Math.max(0, Math.min(5, written - k * 10))
      for (let i = 0; i < len; i++) plot(cv, b + 2 + i, 2 + k * 2, '#5c4a32')
    }
  },
  glyph(g, b, e) {
    const written = mod(e, SEGMENT)
    const line = Math.min(2, Math.floor(written / 10))
    if (line < 2 || written < 25) mark(g, b + 9, 0, '✎', { c: '#e9b49a' })
  },
}

/** Notes floating up while he bobs to the beat. */
const music: Vignette = {
  name: 'music',
  pose: 'dance',
  glyph(g, b, _e, t) {
    const notes = ['♪', '♫', '♬', '♩']
    const colors = ['#ff8fab', '#7dcfff', '#ffd166', '#bb9af7']
    for (let k = 0; k < 4; k++) {
      const age = mod(t + k * 4, 16)
      const lap = Math.floor((t + k * 4) / 16)
      mark(g, b + mod(k * 2 + lap * 3, 9), 3 - Math.floor(age / 4), notes[k]!, { c: colors[k], d: age > 12 })
    }
  },
}

/** Painting dots of color onto a canvas on an easel. */
const paint: Vignette = {
  name: 'paint',
  pose: 'work',
  px(cv, b, e) {
    draw(cv, b + 2, 0, ['CCCCCCC', 'CCCCCCC', 'CCCCCCC', 'CCCCCCC', 'CCCCCCC'], { C: '#f5f0e6' })
    draw(cv, b + 2, 5, ['E.....E', 'E.....E', 'E.....E'], { E: WOOD })
    const dots = Math.min(16, Math.floor(mod(e, SEGMENT) / 2))
    for (let i = 0; i < dots; i++) plot(cv, b + 3 + Math.floor(noise(i * 5) * 5), 1 + Math.floor(noise(i * 7 + 1) * 3), CODE[i % CODE.length]!)
  },
}

/** A cup of coffee, steaming. */
const coffee: Vignette = {
  name: 'coffee',
  pose: 'stand',
  px(cv, b) {
    draw(cv, b + 2, 4, ['MMMM.', 'MCCMH', 'MMMMH', 'MMMM.'], { M: '#e9e4d0', C: '#6f4e37', H: '#e9e4d0' })
    draw(cv, b + 1, 7, ['SSSSSS'], { S: '#a9b1d6' })
  },
  glyph(g, b, _e, t) {
    mark(g, b + 2 + mod(t >> 2, 2), 1, frame(['~', '∿', '~'], t >> 1), { c: '#a9b1d6', d: true })
    mark(g, b + 3 - mod(t >> 2, 2), 0, frame(['∿', '~'], t >> 1), { c: '#a9b1d6', d: true })
  },
}

/** Pondering: a thought starburst, bubbles rising to it. */
const ponder: Vignette = {
  name: 'ponder',
  pose: 'stand',
  glyph(g, b, _e, t) {
    mark(g, b, 3, '·', { c: '#a97c68' })
    if (mod(t, 12) >= 3) mark(g, b + 1, 2, '∘', { c: '#a97c68' })
    if (mod(t, 12) >= 6) mark(g, b + 2, 1, '○', { c: '#c99a86' })
    mark(g, b + 3, 0, frame(SPIN, t), { c: CLAUDE, b: true })
  },
}

/** Holding up a sign: waiting on you. */
const sign: Vignette = {
  name: 'sign',
  pose: 'stand',
  px(cv, b) {
    for (let y = 4; y < 8; y++) plot(cv, b + 3, y, WOOD)
  },
  glyph(g, b, _e, t) {
    put(g, b + 1, 1, ' ? ', { c: '#2b1d18', bg: mod(t, 8) < 5 ? '#ffd166' : '#e0a83a', b: true })
  },
}

/** Every vignette, for tests and the gallery. */
export const VIGNETTES: readonly Vignette[] = [
  laptop, blocks, anvil, cauldron, gears, plant, search, juggle, rocket, tower,
  fishing, bulb, book, telescope, quill, music, paint, coffee, ponder, sign,
]

/** What a tool label is about: `grep: TODO` → search, `shell: npm test` → shell… */
export function toolKind(tool: string | undefined): 'search' | 'web' | 'edit' | 'shell' | 'agent' | 'other' {
  const name = (tool ?? '').split(':')[0]!.trim().toLowerCase()
  if (['read', 'grep', 'glob', 'list', 'ls', 'find'].includes(name)) return 'search'
  if (['websearch', 'webfetch', 'fetch'].includes(name)) return 'web'
  if (['edit', 'write', 'patch', 'multiedit', 'apply_patch'].includes(name)) return 'edit'
  if (['shell', 'bash', 'execute'].includes(name)) return 'shell'
  if (name.startsWith('subagent') || name === 'task' || name === 'agent') return 'agent'
  return 'other'
}

const TOOL_POOLS: Record<ReturnType<typeof toolKind>, readonly Vignette[]> = {
  search: [search, book, telescope],
  web: [telescope, search, book],
  edit: [laptop, quill, paint, blocks],
  shell: [anvil, cauldron, gears, rocket, blocks, laptop],
  agent: [juggle, tower, gears],
  other: [laptop, blocks, anvil, cauldron, gears, plant, search, juggle, rocket, tower],
}

/** The vignettes that fit what the turn is doing. */
export function poolOf(act: Act, tool?: string): readonly Vignette[] {
  if (act === 'tool') return TOOL_POOLS[toolKind(tool)]
  if (act === 'think') return [ponder, bulb, fishing, book, coffee, plant]
  if (act === 'say') return [quill, music, paint, laptop]
  if (act === 'ask') return [sign]
  return [coffee, ponder]
}

// ---- the walk -----------------------------------------------------------------

type Walk = 'walk' | 'skate' | 'carry'

/** Pixels Clawd covers per tick on his way in and out. */
const SPEED = 2

/** One lap's route: where he stops, which side he comes from, how he gets there, and ticks to walk in. */
function routeOf(lap: number, w: number) {
  // Somewhere with room for a vignette on his right.
  const room = Math.max(0, w - CLAWD_W - 1 - BENCH_W)
  const stopX = Math.min(room, Math.floor(room * (0.15 + noise(lap * 3 + 1) * 0.7)))
  const fromRight = noise(lap * 5 + 2) < 0.4
  const walk: Walk = (['walk', 'walk', 'skate', 'carry'] as const)[Math.floor(noise(lap * 7 + 3) * 4)]!
  const inLen = Math.ceil((fromRight ? w - stopX : stopX + CLAWD_W) / SPEED)
  return { stopX, fromRight, walk, inLen }
}

/**
 * Where Clawd is at tick `t`: walking in, at his stop (ticks into it), or
 * walking out. Tick 0 is the start of the first stop: a turn opens with him at work.
 */
function placeOf(t: number, w: number, salt = 0): { x: number; stopped: number | null; lap: number; walk: Walk } {
  const length = lapLength(w)
  const shifted = t + routeOf(salt, w).inLen
  const lap = Math.floor(shifted / length) + salt
  const p = mod(shifted, length)
  const { stopX, fromRight, walk, inLen } = routeOf(lap, w)
  if (p < inLen) {
    const moved = Math.min(p * SPEED, fromRight ? w - stopX : stopX + CLAWD_W)
    return { x: fromRight ? w - moved : moved - CLAWD_W, stopped: null, lap, walk }
  }
  if (p < inLen + STOP) return { x: stopX, stopped: p - inLen, lap, walk }
  const out = (p - inLen - STOP) * SPEED
  return { x: fromRight ? stopX - out : stopX + out, stopped: null, lap, walk }
}

/** Ticks of one lap: in, the stop, and out of sight. */
const lapLength = (w: number) => Math.ceil((w + CLAWD_W + 2) / SPEED) + 1 + STOP

/**
 * One visit to the bench as a stretch of the show (show.ts): a whole lap, or
 * for the turn's first stretch the lap from his stop on. `t` for it is
 * `start + local` (`start` may be negative).
 */
export function benchSpan(w: number, salt: number, isFirst: boolean): { length: number; start: number } {
  const inLen = routeOf(salt, w).inLen
  return isFirst ? { length: lapLength(w) - inLen, start: 0 } : { length: lapLength(w), start: -inLen }
}

// ---- the muse's vignettes ----------------------------------------------------

const museCache = new WeakMap<MuseVignette, Vignette>()

/** A scene the muse wrote: its prop on the bench, two frames taking turns, its caption above. */
export function museVignette(v: MuseVignette): Vignette {
  let made = museCache.get(v)
  if (!made) {
    made = {
      name: `muse:${v.caption}`,
      pose: v.pose,
      px(cv, b, _e, t) {
        const art = frame(v.frames, Math.floor(t / 4))
        draw(cv, b, 7 - art.length, art, v.colors)
      },
      glyph(g, b) {
        put(g, Math.max(0, Math.min(b, g[0]!.length - [...v.caption].length)), 0, v.caption, { c: '#e9b49a' })
      },
    }
    museCache.set(v, made)
  }
  return made
}

/** The vignette Clawd plays at tick `t` and how far into it he is, or null while he walks. */
export function vignetteAt(t: number, w: number, act: Act, tool?: string, muse?: Muse, salt = 0): { vignette: Vignette; e: number } | null {
  const { stopped, lap } = placeOf(t, w, salt)
  if (stopped === null) return null
  const segment = Math.floor(stopped / SEGMENT)
  const e = stopped - segment * SEGMENT
  // The muse's scenes take most segments while there are some (not a waiting ask: that keeps its sign).
  const own = muse?.vignettes ?? []
  if (own.length > 0 && act !== 'ask' && noise(lap * 17 + segment * 3 + 1) < 0.65) {
    return { vignette: museVignette(own[Math.floor(noise(lap * 19 + segment * 7) * own.length)]!), e }
  }
  const pool = poolOf(act, tool)
  return { vignette: pool[Math.floor(noise(lap * 13 + segment * 5 + pool.length) * pool.length)]!, e }
}

/** The workbench: Clawd walks in, works through vignettes, walks out. `SCENE_ROWS` rows. */
export function benchScene(t: number, w: number, act: Act, tool?: string, muse?: Muse, salt = 0): Grid {
  const cv = canvas(w, SCENE_ROWS)
  // A plank floor scrolling under his feet.
  ground(cv, t, 7, 0.5, [WOOD, '#5a4238', WOOD, '#7a5a4c', '#5a4238'])
  const { x, stopped, walk } = placeOf(t, w, salt)
  const bench = x + CLAWD_W + 1
  const blink = mod(t, 30) < 2

  const playing = stopped !== null ? vignetteAt(t, w, act, tool, muse, salt) : null
  const vignette = playing?.vignette ?? null
  const e = playing?.e ?? 0
  vignette?.px?.(cv, bench, e, t, x)

  let art = CLAWD.stand
  let y = 1
  if (stopped === null) {
    const isStep = mod(t, 4) < 2
    if (walk === 'skate') {
      // Riding: feet still, a board under them.
      y = 0
      draw(cv, x + 1, 7, ['KKKKKKKKKKKK'], { K: '#2b2b33' })
      plot(cv, x + 3, 7, '#e0af68')
      plot(cv, x + 10, 7, '#e0af68')
    } else {
      art = isStep ? CLAWD.stand : CLAWD.step
      y = isStep ? 0 : 1
      // A parcel in his arms.
      if (walk === 'carry') draw(cv, x + 10, y + 2, ['CCCC', 'CTTC', 'CCCC'], { C: '#c8a26b', T: '#8b6f47' })
    }
  } else if (vignette) {
    const beat = mod(t, 4) < 2
    if (vignette.pose === 'work') art = beat ? CLAWD.work : CLAWD.stand
    else if (vignette.pose === 'up') art = beat ? CLAWD.up : CLAWD.work
    else if (vignette.pose === 'dance') {
      art = beat ? CLAWD.up : CLAWD.stand
      y = mod(t, 6) < 3 ? 0 : 1
    }
    if (blink && art === CLAWD.stand) art = CLAWD.blink
  }
  draw(cv, x, y, art, CLAWD_COLORS)

  const g = cells(cv)
  glyphStars(g, t, Math.floor(w / 4), 0.05, ['·', '✻'], ['#8a6a5c', '#a97c68', '#6b5248'], 3)
  if (vignette) vignette.glyph?.(g, bench, e, t, x)
  else if (walk === 'skate') mark(g, x - 2, 2, '≡', { c: '#565f89', d: true })
  return g
}
