// The muse: a model asked, while the agent works, for fresh content the show
// then draws. For the skatepark, tricks (real ones and ones made up about the
// work at hand: "git push grind"), each with how the board turns. For the
// workbench, little scenes: a pixel-art prop in two frames and a caption.
// The show stays drawn here, frame by frame; the model only writes the
// content, as JSON, checked strictly. Anything off is dropped. A seed (from the
// sound playing, or crypto) decides when to ask and goes into the prompt;
// meanwhile, and without a model, the show plays what is kept and its own.
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

// ---- what it writes -----------------------------------------------------------

export const BOARDS = ['flat', 'grip', 'under', 'graphic', 'end', 'tail', 'nose'] as const
export type BoardFrame = (typeof BOARDS)[number]
export const TRICK_KINDS = ['flip', 'grab', 'grind', 'manual'] as const
export type TrickKind = (typeof TRICK_KINDS)[number]

export type MuseTrick = { name: string; kind: TrickKind; frames: BoardFrame[]; points: number }

export const MUSE_POSES = ['work', 'up', 'stand', 'dance'] as const
export type MusePose = (typeof MUSE_POSES)[number]

/** A prop drawn on Clawd's bench: frames of pixel rows (`.` empty, else a color key). */
export type MuseVignette = { caption: string; pose: MusePose; frames: string[][]; colors: Record<string, string> }

/** What the scenes get: the content made so far, newest first. */
export type Muse = { tricks: readonly MuseTrick[]; vignettes: readonly MuseVignette[] }

export const PROP_W = 12
export const PROP_H = 5
export const CAPTION_W = 20
const NAME_W = 22

const LANG_NAMES: Record<Lang, string> = {
  en: 'English', 'zh-Hans': 'Simplified Chinese', 'zh-Hant': 'Traditional Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', fr: 'French', de: 'German', 'pt-BR': 'Brazilian Portuguese', ru: 'Russian',
}

/** What the agent is doing, in words for the prompt. */
export function activityOf(act: Act, tool?: string): string {
  if (act === 'tool' && tool) return `running a tool: ${tool}`
  if (act === 'say') return 'writing its answer'
  if (act === 'ask') return 'waiting for the user to approve something'
  return 'thinking about the task'
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
  'You write content for a tiny pixel-art animation shown in a terminal while a coding agent works. ' +
  'Its star is Clawd, a small orange blocky mascot. This is a side job: ignore any earlier conversation ' +
  'except as a theme, do not use tools, and reply with JSON only (no prose, no code fences).'

export function skatePrompt(activity: string, seed: number): string {
  return [
    PREAMBLE,
    `Clawd is skateboarding through a skatepark. The coding agent is ${activity}.`,
    seedLine(seed),
    'Invent 6 skateboard tricks: one or two real ones, the rest made up, punny and themed on that work or on the project (a command, a file, a bug, a tool).',
    'Reply exactly in this shape (the values are placeholders: write your own names, and mix the kinds):',
    '{"tricks":[{"name":"<trick name>","kind":"flip","frames":["flat","grip","under","graphic","flat"],"points":800},{"name":"<trick name>","kind":"grind","frames":["tail"],"points":600}]}',
    `Rules: name at most ${NAME_W} characters, plain letters, digits, spaces and "-". kind is one of flip, grab, grind, manual. points 100 to 2000.`,
    'For a flip, frames are 3 to 9 board positions from: flat, grip (on its side, grip tape showing), under (upside down), graphic (other side), end (turned end-on, a spin); start and end with flat.',
    'For a grind or a manual, frames is one position from: flat, tail, nose, end. For a grab, frames is ["flat"].',
  ].join('\n')
}

/** The format example's frames: a reply that copies them is dropped. */
const EXAMPLE_FRAMES = [['..AAAA..', '..A..A..', 'BBBBBBBB'], ['..AAAA..', '..AAAA..', 'BBBBBBBB']]

export function clawdPrompt(activity: string, lang: Lang, seed: number): string {
  return [
    PREAMBLE,
    `Clawd stands at a little workbench. The coding agent is ${activity}.`,
    seedLine(seed),
    'Invent 3 short, playful scenes of Clawd doing something that fits that work, and draw the prop on his bench as pixel art.',
    'Reply exactly in this shape (an example of the format only: draw your own objects):',
    `{"vignettes":[{"caption":"<caption>","pose":"work","colors":{"A":"#7aa2f7","B":"#e0af68"},"frames":${JSON.stringify(EXAMPLE_FRAMES)}}]}`,
    `Rules: caption at most ${CAPTION_W} characters, in ${LANG_NAMES[lang]}. pose is one of work (hands busy), up (arms raised), stand, dance.`,
    `colors: 1 to 4 single uppercase letters mapped to bright #rrggbb colors that show on a dark background.`,
    `frames: exactly 2 frames that differ a little (the animation). Each frame is 2 to ${PROP_H} rows, each row at most ${PROP_W} characters, "." for empty and a color letter for a pixel. Draw a recognizable object, not noise.`,
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

export function parseTricks(text: string): MuseTrick[] {
  const data = jsonOf(text)
  const list = isRecord(data) && Array.isArray(data.tricks) ? data.tricks : []
  const out: MuseTrick[] = []
  for (const item of list.slice(0, 12)) {
    if (!isRecord(item)) continue
    const name = line(item.name, NAME_W)?.replace(/[^\p{L}\p{N} '\-!]/gu, '').trim()
    const kind = TRICK_KINDS.find(k => k === item.kind)
    // A placeholder sent back as it was is no name.
    if (!name || !kind || /^trick name$/i.test(name)) continue
    let frames = (Array.isArray(item.frames) ? item.frames : []).filter((f): f is BoardFrame => (BOARDS as readonly unknown[]).includes(f))
    if (kind === 'flip') {
      frames = frames.filter(f => f !== 'tail' && f !== 'nose').slice(0, 9)
      if (frames[0] !== 'flat') frames.unshift('flat')
      if (frames.at(-1) !== 'flat') frames.push('flat')
      if (frames.length < 3) continue
    } else if (kind === 'grab') frames = ['flat']
    else frames = [frames.find(f => ['flat', 'tail', 'nose', 'end'].includes(f)) ?? 'flat']
    const raw = typeof item.points === 'number' && Number.isFinite(item.points) ? item.points : 500
    out.push({ name, kind, frames, points: Math.round(Math.min(2000, Math.max(100, raw)) / 50) * 50 })
  }
  return out
}

/** `#rrggbb` from `#rrggbb`, `#rgb` or `#rrggbbaa`; null for anything else. */
function hexOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) return v.slice(0, 7)
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map(c => c + c).join('')}`
  return null
}

export function parseVignettes(text: string): MuseVignette[] {
  const data = jsonOf(text)
  const list = isRecord(data) && Array.isArray(data.vignettes) ? data.vignettes : []
  const out: MuseVignette[] = []
  for (const item of list.slice(0, 6)) {
    if (!isRecord(item)) continue
    const caption = line(item.caption, CAPTION_W)
    const pose = MUSE_POSES.find(p => p === item.pose) ?? 'work'
    const colors: Record<string, string> = {}
    if (isRecord(item.colors)) {
      for (const [key, value] of Object.entries(item.colors)) {
        const hex = hexOf(value)
        if (/^[A-Za-z]$/.test(key) && hex && Object.keys(colors).length < 4) colors[key.toUpperCase()] = hex
      }
    }
    if (!caption || Object.keys(colors).length === 0) continue
    const frames: string[][] = []
    for (const raw of Array.isArray(item.frames) ? item.frames.slice(0, 4) : []) {
      // A frame as rows, or as one string of rows split by newlines or `|`.
      const lines = typeof raw === 'string' ? raw.split(/[\n|]/) : Array.isArray(raw) ? raw : null
      if (!lines) continue
      // Unknown keys become empty; rows are cut to the bench and the frame to its height.
      const rows = lines
        .filter((r): r is string => typeof r === 'string' && r.length > 0)
        .slice(0, PROP_H)
        .map(r => [...r.slice(0, PROP_W)].map(ch => (colors[ch.toUpperCase()] ? ch.toUpperCase() : '.')).join(''))
      if (rows.length > 0 && rows.join('').replace(/\./g, '').length >= 3) frames.push(rows)
    }
    if (frames.length === 0 || /^caption$/i.test(caption.replace(/[<>]/g, ''))) continue
    // The format example sent back: not a drawing.
    if (frames.some(f => EXAMPLE_FRAMES.some(e => e.join('|') === f.join('|')))) continue
    out.push({ caption, pose, frames, colors })
  }
  return out
}

// ---- when to ask ------------------------------------------------------------------

/** Below this many of a kind, the muse is always asked for more of it. */
export const MUSE_LOW = 6
/** Otherwise this share of chances (out of 100, by the seed) asks for new content. */
export const MUSE_CHANCE = 35

/**
 * Whether this chance asks the muse, and for what: the kind with fewer kept
 * (the seed breaks a tie). With both stocked, the seed decides whether to ask
 * at all; meanwhile the scene plays what is kept.
 */
export function museNeed(muse: Muse, seed: number): 'tricks' | 'vignettes' | null {
  const t = muse.tricks.length
  const v = muse.vignettes.length
  const kind = t === v ? (seed % 2 ? 'tricks' : 'vignettes') : t < v ? 'tricks' : 'vignettes'
  const count = kind === 'tricks' ? t : v
  if (count < MUSE_LOW) return kind
  return (seed >>> 8) % 100 < MUSE_CHANCE ? kind : null
}
