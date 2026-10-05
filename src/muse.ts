// The muse: a model asked, while the agent works, for skits, little silent
// plays starring Clawd (stage.ts acts them out). A skit belongs to what the
// agent is doing (thinking, searching, editing, a shell command, subagents, the
// web, writing its answer) and brings its own place, a sticker-style look for
// Clawd, props, and beats: where he goes, what he does to a prop, what effect
// goes off, what he says. The model only writes the script, as JSON, read here
// strictly: anything off is dropped. A seed (from the sound playing, or crypto)
// decides when to ask and goes into the prompt; meanwhile, and without a model,
// the show plays what is kept and its own default scene.
import type { Lang } from './lang'
import type { Act } from './themes'

// ---- the model --------------------------------------------------------------

/** Which model writes: the session's own (`session`), or a provider's model. */
export type ModelPick = 'session' | { providerID: string; id: string }

/** `session`, `provider/model-id` (the id may hold more `/`), or null: off. */
export function parseModel(text: unknown): ModelPick | null {
  if (typeof text !== 'string') return null
  const value = text.trim()
  if (!value || ['off', 'none', 'false'].includes(value.toLowerCase())) return null
  if (value.toLowerCase() === 'session') return 'session'
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) return null
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
}

/** Reasoning variants from least thinking to more: the muse takes the first a model has. */
const LIGHT_VARIANTS = ['none', 'off', 'disabled', 'minimal', 'low']

/** The variant that thinks least among a model's, or undefined (its default) when none is light. */
export function lightestVariant(ids: readonly string[]): string | undefined {
  return LIGHT_VARIANTS.find(v => ids.includes(v))
}

// ---- what the agent is doing ---------------------------------------------------

/** What a skit is about: the kinds of work the agent does. */
export const KINDS = ['think', 'search', 'edit', 'shell', 'agent', 'web', 'say', 'other'] as const
export type Kind = (typeof KINDS)[number]

/** A tool label (`grep: TODO`, `shell: npm test`) as the kind of work it is. */
export function toolKind(tool: string | undefined): Kind {
  const name = (tool ?? '').split(':')[0]!.trim().toLowerCase()
  if (['read', 'grep', 'glob', 'list', 'ls', 'find'].includes(name)) return 'search'
  if (['websearch', 'webfetch', 'fetch'].includes(name)) return 'web'
  if (['edit', 'write', 'patch', 'multiedit', 'apply_patch'].includes(name)) return 'edit'
  if (['shell', 'bash', 'execute'].includes(name)) return 'shell'
  if (name.startsWith('subagent') || name === 'task' || name === 'agent') return 'agent'
  return 'other'
}

/** The kind of work for a turn's act and its tool. An ask has none: it keeps the default scene's sign. */
export function kindOf(act: Act, tool?: string): Kind | null {
  if (act === 'ask') return null
  if (act === 'tool') return toolKind(tool)
  if (act === 'say') return 'say'
  return 'think'
}

const KIND_WORDS: Record<Kind, string> = {
  think: 'thinking the task over',
  search: 'searching and reading files',
  edit: 'editing code',
  shell: 'running shell commands',
  agent: 'sending subagents off to work in parallel',
  web: 'looking things up on the web',
  say: 'writing its answer',
  other: 'using a tool',
}

// ---- the script --------------------------------------------------------------

/** What Clawd looks like in a skit, the way his stickers dress him. His body stays his own. */
export const EYES = ['normal', 'happy', 'closed', 'dizzy', 'hearts', 'shades', 'stars'] as const
export type MuseLook = {
  eyes: (typeof EYES)[number]
  hat: string[]
  held: string[]
  colors: Record<string, string>
  shiny: boolean
}
/** Look and prop art is in fine pixels, half a show pixel each way: Clawd is 28 × 14 of them. */
export const HAT_W = 28
export const HAT_H = 8
export const HELD_W = 12
export const HELD_H = 10

/** Where a skit plays: what stands far off, what hangs in the sky, the weather, the colors. */
export const BACKDROPS = ['none', 'city', 'hills', 'mountains', 'forest', 'sea', 'desert', 'space', 'snow', 'room'] as const
export const SKIES = ['none', 'moon', 'sun', 'planet'] as const
export const WEATHERS = ['clear', 'stars', 'rain', 'snow', 'leaves', 'fireflies', 'bubbles', 'sakura'] as const
export type MusePlace = {
  backdrop: (typeof BACKDROPS)[number]
  sky: (typeof SKIES)[number]
  weather: (typeof WEATHERS)[number]
  colors: { far: string; near: string; ground: string; accent: string }
}

/** How a prop moves on its own. */
export const MOTIONS = ['still', 'bob', 'float', 'fall', 'spin', 'blink', 'shake', 'orbit', 'grow'] as const
export type SkitProp = {
  id: string
  /** One to three frames of pixel rows; with more than one they take turns. */
  frames: string[][]
  colors: Record<string, string>
  /** Where it stands, 0 (left) to 1 (right). */
  x: number
  motion: (typeof MOTIONS)[number]
}
export const PROP_W = 24
export const PROP_H = 12

/** What Clawd does in a beat; `carry`, `throw` and `push` act on the beat's prop. */
export const ACTIONS = ['walk', 'stand', 'work', 'jump', 'wave', 'cheer', 'dance', 'sit', 'sleep', 'carry', 'throw', 'push', 'look'] as const
export const EFFECTS = ['none', 'sparks', 'hearts', 'notes', 'zzz', 'steam', 'confetti', 'stars', 'bubbles', 'lightning', 'smoke', 'rain', 'question', 'exclaim'] as const
export type SkitBeat = {
  do: (typeof ACTIONS)[number]
  /** Where he goes (walk, carry, push) or where a thrown prop lands, 0 to 1. */
  to: number | null
  prop: string | null
  effect: (typeof EFFECTS)[number]
  say: string
  /** How long the beat lasts. */
  secs: number
}

export type MuseSkit = {
  kind: Kind
  title: string
  place: MusePlace | null
  look: MuseLook | null
  props: SkitProp[]
  beats: SkitBeat[]
}

/** What the show gets: the skits made so far, newest first. */
export type Muse = { skits: readonly MuseSkit[] }

export const TITLE_W = 24
export const SAY_W = 24
export const MAX_PROPS = 4
export const MAX_BEATS = 8
export const MAX_SECS = 30

// ---- the prompt -------------------------------------------------------------

const LANG_NAMES: Record<Lang, string> = {
  en: 'English', 'zh-Hans': 'Simplified Chinese', 'zh-Hant': 'Traditional Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', fr: 'French', de: 'German', 'pt-BR': 'Brazilian Portuguese', ru: 'Russian',
}

/** Words the seed picks two of, to send each batch somewhere new. */
const FLAVORS = [
  'space', 'ocean', 'jungle', 'medieval', 'cooking', 'robots', 'music', 'weather', 'circus', 'pirates',
  'dinosaurs', 'gardening', 'arcade games', 'trains', 'volcanoes', 'insects', 'magic', 'sports', 'desserts', 'deep sea',
  'detectives', 'winter', 'neon city', 'origami',
]

/** The seed in words for the prompt: the number and two themes it picks. */
export function seedLine(seed: number): string {
  const a = FLAVORS[seed % FLAVORS.length]!
  const b = FLAVORS[Math.floor(seed / FLAVORS.length) % FLAVORS.length]!
  return `Random seed ${seed}: let it steer you to unusual ideas, and borrow a little from "${a}" and "${b}".`
}

const PREAMBLE =
  'You write skits for a tiny pixel-art theater shown in a terminal while a coding agent works. ' +
  'Its star is Clawd, a small orange blocky mascot (28 pixels wide, 14 tall, two tall black eyes near the top, stubby arms out at the sides, four short legs). ' +
  'This is a side job: ignore any earlier conversation except as a theme, do not use tools, and reply with JSON only ' +
  '(no prose, no code fences). Answer right away: this needs no long thinking.'

/** The format example: a reply that sends it back as it is gets dropped. */
const EXAMPLE = {
  title: '<title>',
  place: { backdrop: 'sea', sky: 'moon', weather: 'stars', colors: { far: '#24283b', near: '#414868', ground: '#565f89', accent: '#e0af68' } },
  look: { eyes: 'happy', shiny: false, colors: { A: '#ffd166', B: '#e0af68' }, hat: ['..........AAAAAAAA', '........AAAAAAAAAAAA', '......BBBBBBBBBBBBBBBB'], held: [] },
  props: [{ id: 'lamp', x: 0.7, motion: 'bob', colors: { B: '#7aa2f7', C: '#ffd166' }, frames: [['...CCCC...', '..CCCCCC..', 'BBBBBBBBBB', '.BBBBBBBB.', '...BBBB...'], ['....CC....', '...CCCC...', 'BBBBBBBBBB', '.BBBBBBBB.', '...BBBB...']] }],
  beats: [
    { do: 'walk', to: 0.5, secs: 2, effect: 'none', say: '' },
    { do: 'look', prop: 'lamp', secs: 2, effect: 'question', say: '<a line>' },
    { do: 'carry', prop: 'lamp', to: 0.2, secs: 3, effect: 'sparks', say: '' },
  ],
}

export function skitPrompt(kind: Kind, detail: string | undefined, lang: Lang, seed: number): string {
  return [
    PREAMBLE,
    `The coding agent is ${KIND_WORDS[kind]}${detail ? ` (now: ${detail})` : ''}. Write 2 skits that play while it does that: Clawd acting out, joking about or helping with that kind of work, in his own way.`,
    seedLine(seed),
    'Be inventive and make the two skits very different: different places, props, actions, effects and gags. A skit lasts 6 to 20 seconds.',
    'Reply exactly in this shape (the values only show the format: invent your own):',
    JSON.stringify({ skits: [EXAMPLE] }),
    `Rules. title and every say: at most ${TITLE_W} characters, in ${LANG_NAMES[lang]}; say may be "".`,
    `place: backdrop one of ${BACKDROPS.join(', ')}; sky one of ${SKIES.join(', ')}; weather one of ${WEATHERS.join(', ')}; colors are #rrggbb on a dark terminal (far dim, near brighter, ground the floor, accent bright). place may be null.`,
    `look (like his stickers: coffee, headphones, a wave, a wand, a light bulb, dizzy, a heart...): eyes one of ${EYES.join(', ')}; shiny true for a holographic shimmer (rarely); hat 0 to ${HAT_H} rows of up to ${HAT_W} characters on his head; held 0 to ${HELD_H} rows of up to ${HELD_W} characters in his hand. look may be null.`,
    `props: 0 to ${MAX_PROPS}, each with a short lowercase id, x from 0 (left) to 1 (right), motion one of ${MOTIONS.join(', ')}, and 1 to 3 frames of up to ${PROP_H} rows of up to ${PROP_W} characters. Draw recognizable objects.`,
    'Pixel rows: "." is empty, a color letter is a pixel; colors map 1 to 4 single uppercase letters to bright #rrggbb. Pixels are small (Clawd is 28 × 14 of them), so draw with detail: outlines, highlights, recognizable shapes.',
    `beats: 2 to ${MAX_BEATS}, played in order. do is one of ${ACTIONS.join(', ')}. to (0 to 1) is where he walks, carries or pushes a prop to, or where a thrown prop lands. prop names the prop he acts on (needed for carry, throw, push; optional for look and work). effect one of ${EFFECTS.join(', ')}. secs 1 to 6.`,
  ].join('\n')
}

// ---- reading the reply ------------------------------------------------------------

/** The first JSON object in a reply, fences and chatter around it ignored. */
export function jsonOf(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Printable text, one line, cut to `max` characters. */
function line(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const text = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? [...text].slice(0, max).join('') : null
}

/** A placeholder sent back as it was: `<title>`, `<a line>`. */
const isPlaceholder = (text: string) => /^<[^>]*>$/.test(text.trim())

/** `#rrggbb` from `#rrggbb`, `#rgb` or `#rrggbbaa`; null for anything else. */
function hexOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) return v.slice(0, 7)
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map(c => c + c).join('')}`
  return null
}

/** Up to four single-letter color keys (uppercased) to #rrggbb. */
function colorKeys(raw: unknown): Record<string, string> {
  const colors: Record<string, string> = {}
  if (!isRecord(raw)) return colors
  for (const [key, value] of Object.entries(raw)) {
    const hex = hexOf(value)
    if (/^[A-Za-z]$/.test(key) && hex && Object.keys(colors).length < 4) colors[key.toUpperCase()] = hex
  }
  return colors
}

/** Pixel rows cut to `w` × `h`, unknown keys emptied; empty when nothing is drawn. Rows may come as one string split by newlines or `|`. */
function pixelRows(raw: unknown, colors: Record<string, string>, w: number, h: number): string[] {
  const lines = typeof raw === 'string' ? raw.split(/[\n|]/) : Array.isArray(raw) ? raw : []
  const rows = lines
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
    .slice(0, h)
    .map(r => [...r.slice(0, w)].map(ch => (colors[ch.toUpperCase()] ? ch.toUpperCase() : '.')).join(''))
  return rows.join('').replace(/\./g, '').length > 0 ? rows : []
}

const fraction = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null)
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => list.find(x => x === v) ?? fallback

function readPlace(raw: unknown): MusePlace | null {
  if (!isRecord(raw)) return null
  const c = isRecord(raw.colors) ? raw.colors : {}
  const [far, near, ground, accent] = [hexOf(c.far), hexOf(c.near), hexOf(c.ground), hexOf(c.accent)]
  if (!far || !near || !ground || !accent) return null
  return { backdrop: oneOf(BACKDROPS, raw.backdrop, 'none'), sky: oneOf(SKIES, raw.sky, 'none'), weather: oneOf(WEATHERS, raw.weather, 'clear'), colors: { far, near, ground, accent } }
}

function readLook(raw: unknown): MuseLook | null {
  if (!isRecord(raw)) return null
  const colors = colorKeys(raw.colors)
  const look: MuseLook = {
    eyes: oneOf(EYES, raw.eyes, 'normal'),
    hat: pixelRows(raw.hat, colors, HAT_W, HAT_H),
    held: pixelRows(raw.held, colors, HELD_W, HELD_H),
    colors,
    shiny: raw.shiny === true,
  }
  // A look that changes nothing is none.
  return look.eyes === 'normal' && !look.shiny && look.hat.length === 0 && look.held.length === 0 ? null : look
}

function readProps(raw: unknown): SkitProp[] {
  const out: SkitProp[] = []
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_PROPS) : []) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' ? item.id.trim().toLowerCase().slice(0, 16) : ''
    if (!id || out.some(p => p.id === id)) continue
    const colors = colorKeys(item.colors)
    const frames = (Array.isArray(item.frames) ? item.frames.slice(0, 3) : [])
      .map(f => pixelRows(f, colors, PROP_W, PROP_H))
      .filter(f => f.length > 0)
    if (frames.length === 0) continue
    out.push({ id, frames, colors, x: fraction(item.x) ?? 0.6, motion: oneOf(MOTIONS, item.motion, 'still') })
  }
  return out
}

const NEEDS_PROP = new Set(['carry', 'throw', 'push'])

function readBeats(raw: unknown, props: readonly SkitProp[]): SkitBeat[] {
  const out: SkitBeat[] = []
  let total = 0
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_BEATS) : []) {
    if (!isRecord(item)) continue
    const action = ACTIONS.find(a => a === item.do)
    if (!action) continue
    const named = typeof item.prop === 'string' ? item.prop.trim().toLowerCase() : null
    const prop = named && props.some(p => p.id === named) ? named : null
    // A beat that acts on a prop it doesn't have is the plain action instead.
    const act = NEEDS_PROP.has(action) && !prop ? (action === 'throw' ? 'stand' : 'walk') : action
    const said = line(item.say, SAY_W) ?? ''
    const secs = typeof item.secs === 'number' && Number.isFinite(item.secs) ? Math.min(6, Math.max(1, item.secs)) : 2
    if (total + secs > MAX_SECS) break
    total += secs
    out.push({ do: act, to: fraction(item.to), prop, effect: oneOf(EFFECTS, item.effect, 'none'), say: isPlaceholder(said) ? '' : said, secs })
  }
  return out
}

/** Whether two pieces of pixel art are mostly the same: three quarters of their pixels or more. */
function alike(a: readonly string[], b: readonly string[]): boolean {
  const h = Math.max(a.length, b.length)
  const w = Math.max(...a.map(r => r.length), ...b.map(r => r.length))
  let same = 0
  let drawn = 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = a[j]?.[i] ?? '.'
      const y = b[j]?.[i] ?? '.'
      if (x === '.' && y === '.') continue
      drawn++
      if (x === y) same++
    }
  }
  return drawn > 0 && same / drawn >= 0.75
}

/** The skits in a reply, each checked; `kind` is the work they were asked for. */
export function parseSkits(text: string, kind: Kind): MuseSkit[] {
  const data = jsonOf(text)
  const list = isRecord(data) && Array.isArray(data.skits) ? data.skits : []
  const out: MuseSkit[] = []
  for (const item of list.slice(0, 4)) {
    if (!isRecord(item)) continue
    const title = line(item.title, TITLE_W)
    if (!title || isPlaceholder(title)) continue
    const props = readProps(item.props)
    const beats = readBeats(item.beats, props)
    if (beats.length < 2) continue
    const skit: MuseSkit = { kind, title, place: readPlace(item.place), look: readLook(item.look), props, beats }
    // Props copied from the format example (even with a few pixels changed) are not the model's own.
    skit.props = skit.props.filter(p => !p.frames.some(f => EXAMPLE.props.some(e => e.frames.some(ef => alike(f, ef)))))
    skit.beats = skit.beats.map(b => (b.prop && !skit.props.some(p => p.id === b.prop) ? { ...b, prop: null, do: NEEDS_PROP.has(b.do) ? 'walk' : b.do } : b))
    out.push(skit)
  }
  return out
}

// ---- when to ask ------------------------------------------------------------------

/** Below this many skits for the work at hand, the muse is always asked for more. */
export const MUSE_LOW = 3
/** Otherwise this share of chances (out of 100, by the seed) asks for new ones. */
export const MUSE_CHANCE = 35

/** The kept skits for a kind of work. */
export const skitsFor = (muse: Muse | undefined, kind: Kind) => (muse?.skits ?? []).filter(s => s.kind === kind)

/** Whether this chance asks the muse for skits for `kind`: always when few are kept, else as the seed says. */
export function museNeed(muse: Muse, kind: Kind, seed: number): boolean {
  if (skitsFor(muse, kind).length < MUSE_LOW) return true
  return (seed >>> 8) % 100 < MUSE_CHANCE
}
