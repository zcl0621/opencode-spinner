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
export const BACKDROPS = [
  'none', 'city', 'hills', 'mountains', 'forest', 'sea', 'desert', 'space', 'snow', 'room',
  'stage', 'road', 'beach', 'library', 'castle', 'cave', 'underwater', 'kitchen', 'stadium', 'haunted', 'jungle', 'classroom',
] as const
export const SKIES = ['none', 'moon', 'sun', 'planet', 'clouds', 'rainbow', 'ufo'] as const
export const WEATHERS = ['clear', 'stars', 'rain', 'snow', 'leaves', 'fireflies', 'bubbles', 'sakura', 'confetti', 'fog', 'embers'] as const
export type MusePlace = {
  backdrop: (typeof BACKDROPS)[number]
  sky: (typeof SKIES)[number]
  weather: (typeof WEATHERS)[number]
  colors: { far: string; near: string; ground: string; accent: string }
}

/** How a prop moves on its own. */
export const MOTIONS = ['still', 'bob', 'float', 'fall', 'spin', 'blink', 'shake', 'orbit', 'grow', 'dance', 'hop', 'pace', 'sway', 'flap'] as const
export const EFFECTS = [
  'none', 'sparks', 'hearts', 'notes', 'zzz', 'steam', 'confetti', 'stars', 'bubbles', 'lightning', 'smoke', 'rain', 'question', 'exclaim',
  'impact', 'dust', 'thought', 'tears', 'fire', 'wind',
] as const
export type SkitProp = {
  id: string
  /** One to three frames of pixel rows; with more than one they take turns. */
  frames: string[][]
  colors: Record<string, string>
  /** Where it stands, 0 (left) to 1 (right). */
  x: number
  motion: (typeof MOTIONS)[number]
  /** An effect that keeps going around it (notes over a drummer, smoke over a pot). */
  effect: (typeof EFFECTS)[number]
}
export const PROP_W = 24
export const PROP_H = 12

/** One of the Clawds in a skit: a name, a body color, a look. */
export type SkitActor = { name: string; color: string; look: MuseLook | null }
export const CLAWD_COLOR = '#d77757'
/** Body colors for the rest of the cast when the model gives none. */
const CAST_COLORS = ['#7aa2f7', '#9ece6a', '#bb9af7']

/**
 * What a Clawd does in a beat. Props: `carry`, `throw`, `push`, `ride`, the
 * instruments (`strum`, `drum`, `blow`, `keys`), `eat`, `read`, `hold`, `hide`,
 * `juggle`, `stir`, `type`, `drink`, `call`, `sweep`, `climb`, `photo` need
 * one. Partners: `highfive`, `hug`, `chase`, `follow`, `handshake`, `argue`,
 * `lift`, `scare`, `waltz` need another Clawd (`with`); `punch`, `kick`,
 * `throw`, `cast`, `look`, `point`, `kneel`, `photo` may take one.
 */
export const ACTIONS = [
  'walk', 'run', 'stand', 'jump', 'wave', 'cheer', 'dance', 'sit', 'sleep', 'look', 'bow', 'spin', 'shiver', 'fall', 'hide', 'think',
  'clap', 'point', 'nod', 'refuse', 'laugh', 'cry', 'stretch', 'sneak', 'march', 'crawl', 'flip', 'roll', 'salute', 'sing', 'panic',
  'faint', 'meditate', 'teleport', 'kneel',
  'work', 'dig', 'paint', 'read', 'eat', 'hold', 'cast', 'punch', 'kick',
  'juggle', 'stir', 'type', 'drink', 'call', 'sweep', 'climb', 'photo',
  'strum', 'drum', 'blow', 'keys',
  'carry', 'throw', 'push', 'ride', 'fly', 'swim',
  'highfive', 'hug', 'chase', 'follow', 'handshake', 'argue', 'lift', 'scare', 'waltz',
] as const
/** A built-in action, or `move`: one of the skit's own moves (`SkitMove`). */
export type Action = (typeof ACTIONS)[number] | 'move'
/** What an action becomes when the prop or partner it needs is missing. */
const WITHOUT_PROP: Partial<Record<Action, Action>> = {
  carry: 'walk', throw: 'stand', push: 'walk', ride: 'walk', strum: 'dance', drum: 'dance', blow: 'dance', keys: 'dance',
  eat: 'stand', read: 'think', hold: 'wave', hide: 'sit',
  juggle: 'cheer', stir: 'work', type: 'work', drink: 'stand', call: 'think', sweep: 'walk', climb: 'jump', photo: 'point',
}
const WITHOUT_PARTNER: Partial<Record<Action, Action>> = {
  highfive: 'wave', hug: 'cheer', chase: 'run', follow: 'walk', handshake: 'wave', argue: 'refuse', lift: 'cheer', scare: 'jump', waltz: 'dance',
}

export const ARMS = ['up', 'mid', 'out', 'down'] as const
export const LEGS = ['stand', 'step', 'kick'] as const
/** One pose of a move: arms, legs, how high he is, a nudge sideways, crouched, turned around, his eyes. */
export type MoveFrame = {
  left: (typeof ARMS)[number]
  right: (typeof ARMS)[number]
  legs: (typeof LEGS)[number]
  /** Pixels off the floor, -1 (a dip) to 5. */
  lift: number
  /** Pixels sideways, -3 to 3. */
  dx: number
  low: boolean
  flip: boolean
  eyes: (typeof EYES)[number] | null
}
/**
 * A move the model makes up for a skit (a moonwalk, a robot dance, a victory
 * stomp): poses played in a loop, `tempo` ticks each. An act names it in `do`.
 */
export type SkitMove = { name: string; tempo: number; frames: MoveFrame[]; effect: (typeof EFFECTS)[number] }
export const MAX_MOVES = 4
export const MAX_MOVE_FRAMES = 8

export type SkitAct = {
  /** Which Clawd (index in the cast). */
  who: number
  do: Action
  /** With `do: 'move'`: the name of the skit's move. */
  move?: string
  /** Where he goes (walk, carry, push...) or where a thrown prop lands, 0 to 1. */
  to: number | null
  prop: string | null
  /** The Clawd he acts with (index in the cast). */
  with: number | null
  effect: (typeof EFFECTS)[number]
  say: string
}
/** A beat: what each Clawd in it does at the same time, for `secs` seconds. The others look on. A caption is the narrator's line over it. */
export type SkitBeat = { secs: number; acts: SkitAct[]; caption?: string }

export type MuseSkit = {
  kind: Kind
  title: string
  place: MusePlace | null
  cast: SkitActor[]
  props: SkitProp[]
  /** Moves the model made up for this skit (absent in skits kept from before). */
  moves?: SkitMove[]
  beats: SkitBeat[]
  /** What happened, in a sentence, so the next episode can follow on. */
  summary?: string
  /** Its number in the series, when it is an episode (`numberEpisodes`), and when it was made (ms). */
  episode?: number
  at?: number
}

/** What the show gets: the skits made so far, newest first. */
export type Muse = { skits: readonly MuseSkit[] }

export const TITLE_W = 24
export const SAY_W = 24
export const NAME_W = 10
export const MAX_CAST = 3
export const MAX_PROPS = 4
export const MAX_BEATS = 10
export const MAX_ACTS = 3
export const MAX_SECS = 36
export const CAPTION_W = 28
/** The summary the prompt asks for, and what is kept (a little more, so one running long isn't cut). */
export const SUMMARY_ASK = 120
export const SUMMARY_W = 160
/** Episodes the prompt recalls, and how long the session's news stays news. */
export const RECALL = 3
export const NEWS_FRESH_MS = 30 * 60_000
/** After this long without a new episode, the next chance always asks for one. */
export const EPISODE_EVERY_MS = 8 * 60_000

/** A skit kept before casts and beats of several acts (one Clawd, a beat a deed) in today's shape. */
export function upgradeSkit(skit: MuseSkit): MuseSkit {
  return withoutNumbers(reshaped(skit))
}

/** A kept skit with any episode number the model wrote into its title or captions taken out (kept before that was checked). */
function withoutNumbers(skit: MuseSkit): MuseSkit {
  const title = unnumbered(skit.title) ?? skit.title
  const beats = skit.beats.map(b => {
    if (!b.caption) return b
    const caption = unnumbered(b.caption)
    if (caption === b.caption) return b
    const { caption: _, ...rest } = b
    return caption ? { ...rest, caption } : rest
  })
  return title === skit.title && beats.every((b, i) => b === skit.beats[i]) ? skit : { ...skit, title, beats }
}

function reshaped(skit: MuseSkit): MuseSkit {
  const old = skit as unknown as { look?: MuseLook | null; cast?: SkitActor[]; beats: (SkitBeat & Partial<SkitAct>)[] }
  if (Array.isArray(old.cast) && old.beats.every(b => Array.isArray(b.acts))) return skit
  return {
    ...skit,
    cast: old.cast ?? [{ name: 'Clawd', color: CLAWD_COLOR, look: old.look ?? null }],
    props: skit.props.map(p => ({ ...p, effect: p.effect ?? 'none' })),
    beats: old.beats.map(b =>
      Array.isArray(b.acts) ? b : { secs: b.secs, acts: [{ who: 0, do: b.do!, to: b.to ?? null, prop: b.prop ?? null, with: null, effect: b.effect ?? 'none', say: b.say ?? '' }] },
    ),
  }
}

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
/** Kinds of scenes from films, novels and shows: the seed picks one to stage the skit like. */
const GENRES = [
  'a rock concert', 'a road trip', 'a cooking show', 'a heist', 'a detective noir', 'a space mission', 'a pirate voyage',
  'a haunted house', 'a kung fu duel', 'a magic show', 'a sports final', 'a wedding party', 'a camping trip', 'a superhero rescue',
  'a deep-sea dive', 'a school day', 'a dance battle', 'a western showdown', 'a fairy tale', 'a monster movie', 'a spy thriller',
  'an office sitcom', 'a zombie escape', 'a time-travel mix-up', 'a rom-com meet-cute', 'a training montage', 'a courtroom drama',
  'a nature documentary', 'a game show', 'a jazz club night', 'a street parade', 'a treasure hunt', 'a talent show', 'a train journey',
]

/** The seed in words for the prompt: the number, a kind of scene and two themes it picks. */
export function seedLine(seed: number): string {
  const a = FLAVORS[seed % FLAVORS.length]!
  const b = FLAVORS[Math.floor(seed / FLAVORS.length) % FLAVORS.length]!
  const genre = GENRES[Math.floor(seed / 7) % GENRES.length]!
  return `Random seed ${seed}: let it steer you to unusual ideas. Stage one skit like ${genre}, and borrow a little from "${a}" and "${b}".`
}

const PREAMBLE =
  'You write skits for a tiny pixel-art theater shown in a terminal while a coding agent works. ' +
  'Its stars are Clawds: small blocky mascots (28 pixels wide, 14 tall, two tall eyes near the top, stubby arms that can go up, forward, out or down, four short legs). ' +
  'The main one is Clawd, orange; a skit may bring in one or two more Clawds in other colors, so they can play together. ' +
  'This is a side job: ignore any earlier conversation except as a theme, do not use tools, and reply with JSON only ' +
  '(no prose, no code fences). Answer right away: this needs no long thinking.'

/** The format example: a reply that sends it back as it is gets dropped. */
const EXAMPLE = {
  title: '<title>',
  summary: '<what happened, in one sentence>',
  place: { backdrop: 'stage', sky: 'none', weather: 'clear', colors: { far: '#24283b', near: '#414868', ground: '#565f89', accent: '#e0af68' } },
  cast: [
    { name: 'Clawd', color: CLAWD_COLOR, look: { eyes: 'happy', shiny: false, colors: { A: '#ffd166', B: '#e0af68' }, hat: ['..........AAAAAAAA', '........AAAAAAAAAAAA', '......BBBBBBBBBBBBBBBB'], held: [] } },
    { name: '<name>', color: '#7aa2f7', look: null },
  ],
  props: [{ id: 'lamp', x: 0.7, motion: 'bob', effect: 'none', colors: { B: '#7aa2f7', C: '#ffd166' }, frames: [['...CCCC...', '..CCCCCC..', 'BBBBBBBBBB', '.BBBBBBBB.', '...BBBB...'], ['....CC....', '...CCCC...', 'BBBBBBBBBB', '.BBBBBBBB.', '...BBBB...']] }],
  moves: [{ name: '<move>', tempo: 3, effect: 'none', frames: [{ left: 'up', right: 'down', legs: 'step', lift: 1, dx: -1 }, { left: 'down', right: 'up', legs: 'stand', lift: 0, dx: 1, flip: true }] }],
  beats: [
    { secs: 2, caption: '<narrator>', acts: [{ who: 'Clawd', do: 'walk', to: 0.3 }, { who: '<name>', do: 'wave', say: '<a line>' }] },
    { secs: 3, acts: [{ who: 'Clawd', do: 'highfive', with: '<name>', effect: 'sparks' }, { who: '<name>', do: '<move>' }] },
    { secs: 3, acts: [{ who: '<name>', do: 'carry', prop: 'lamp', to: 0.9 }, { who: 'Clawd', do: 'chase', with: '<name>', say: '<a line>' }] },
  ],
}

/** The series so far, for the prompt: the last episodes, oldest first, its regular cast, and the session's news. */
export type Story = {
  previously: { episode: number; title: string; summary: string }[]
  cast: SkitActor[]
  news: string[]
  /** Names the recalled summaries keep bringing up who were never in the cast. */
  offstage: string[]
}

/** Capitalized words that are not names. */
const NOT_NAMES = new Set(['The', 'A', 'An', 'And', 'But', 'Then', 'When', 'While', 'After', 'Before', 'Meanwhile', 'Now', 'Later', 'Finally', 'At', 'In', 'On', 'With', 'As', 'It', 'They', 'He', 'She', 'Everyone', 'CI', 'PR', 'API', 'JSON', 'Episode'])

/** Names in two or more summaries (words with a capital, not at the start of a sentence word list above) that no cast member has. */
function offstageOf(summaries: readonly string[], cast: readonly SkitActor[]): string[] {
  const known = new Set(cast.flatMap(a => [a.name.toLowerCase(), ...a.name.split(/\s+/).map(w => w.toLowerCase())]))
  const seen = new Map<string, number>()
  for (const summary of summaries) {
    for (const word of new Set(summary.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])) {
      if (NOT_NAMES.has(word) || known.has(word.toLowerCase())) continue
      seen.set(word, (seen.get(word) ?? 0) + 1)
    }
  }
  return [...seen].filter(([, n]) => n >= 2).map(([w]) => w).slice(0, 2)
}

/** The story so far from the kept skits (newest first) and what happened in the session lately. */
export function storyOf(muse: Muse, news: readonly string[] = []): Story {
  const episodes = muse.skits.filter(s => s.episode !== undefined && s.summary)
  const previously = episodes.slice(0, RECALL).reverse().map(s => ({ episode: s.episode!, title: s.title, summary: s.summary! }))
  const cast = episodes[0]?.cast ?? []
  // Everyone who has been on stage in the recalled episodes counts as known.
  const everyone = episodes.slice(0, RECALL).flatMap(s => s.cast)
  return { previously, cast, news: [...news], offstage: offstageOf(previously.map(p => p.summary), everyone) }
}

/** What the next episode is numbered: one past the newest kept. */
export const nextEpisode = (muse: Muse) => Math.max(0, ...muse.skits.map(s => s.episode ?? 0)) + 1

/**
 * The first skit of a reply is the series' next episode: it gets its number,
 * and the regulars it brings back keep their look when the model gave none.
 */
export function numberEpisodes(made: readonly MuseSkit[], muse: Muse, now = Date.now()): MuseSkit[] {
  if (made.length === 0) return []
  const regulars = storyOf(muse).cast
  const [first, ...rest] = made
  const cast = first!.cast.map(a => {
    const regular = regulars.find(r => r.name.toLowerCase() === a.name.toLowerCase())
    return regular && !a.look ? { ...a, look: regular.look } : a
  })
  return [{ ...first!, cast, episode: nextEpisode(muse), at: now }, ...rest]
}

function storyLines(story: Story | undefined): string[] {
  const out: string[] = []
  if (story && story.previously.length > 0) {
    const last = story.previously[story.previously.length - 1]!
    out.push(
      `The first skit is episode ${last.episode + 1} of an ongoing series. Previously: ${story.previously.map(p => `ep. ${p.episode} "${p.title}": ${p.summary}`).join(' ')} ` +
        `Pick up from there with its regulars: ${story.cast.map(a => `${a.name} (${a.color})`).join(', ')}; keep their names and colors. ` +
        `Keep one thread running across episodes (a rival, a mystery, a quest) that builds for a few episodes and then pays off, and start a new one after. ` +
        `Anyone the story names (a rival, a guest, someone from the summaries) is on stage as a cast member, not only talked about; with at most ${MAX_CAST} on stage, a regular may sit the episode out to make room. The second skit stands on its own.`,
    )
  } else out.push('The first skit is episode 1 of a new series: introduce its regular cast, with names worth coming back to, and start a thread (a rival, a mystery, a quest) that later episodes can build on. The second skit stands on its own.')
  if (story && story.offstage.length > 0) out.push(`${story.offstage.join(' and ')} keep${story.offstage.length === 1 ? 's' : ''} coming up in the story but never appeared: bring ${story.offstage.length === 1 ? 'them' : 'both'} on stage in the first skit as cast members.`)
  if (story && story.news.length > 0) out.push(`Lately in the coding session: ${story.news.join('; ')}. Work that into the first skit: its trouble, its twist or its ending.`)
  return out
}

export function skitPrompt(kind: Kind, detail: string | undefined, lang: Lang, seed: number, story?: Story): string {
  return [
    PREAMBLE,
    `The coding agent is ${KIND_WORDS[kind]}${detail ? ` (now: ${detail})` : ''}. Write 2 skits that play while it does that: the Clawds acting out, joking about or helping with that kind of work, in their own way.`,
    seedLine(seed),
    'Be inventive and make the two skits very different: different places, casts, props, actions and gags. Think of scenes from films, novels and shows: a band on stage, a car chase, a cooking duel, a kung fu fight, a magic trick, a parade. A skit lasts 8 to 30 seconds.',
    'Each skit tells a tiny story: a setup, then trouble or a twist (something breaks, a rival shows up, a plan goes wrong), then how it is solved or a punchline. Every beat moves it on; do not just cheer in a loop.',
    ...storyLines(story),
    'Reply exactly in this shape (the values only show the format: invent your own):',
    JSON.stringify({ skits: [EXAMPLE] }),
    `Rules. title, names, summary, every say and caption: in ${LANG_NAMES[lang]}; title and say at most ${TITLE_W} characters, names at most ${NAME_W}, a caption at most ${CAPTION_W}, the summary at most ${SUMMARY_ASK}; say may be "". summary: what happened, in one sentence, for the next episode to follow on. A beat may have a caption, the narrator's line shown over it ("Meanwhile...", "Three bugs later", "Plot twist!"): use a few, where they help the story. Titles, captions and lines belong inside the story: never mention episodes, series, casts, skits or these rules in them, nor number episodes in titles.`,
    `place: backdrop one of ${BACKDROPS.join(', ')}; sky one of ${SKIES.join(', ')}; weather one of ${WEATHERS.join(', ')}; colors are #rrggbb on a dark terminal (far dim, near brighter, ground the floor, accent bright). place may be null.`,
    `cast: 1 to ${MAX_CAST} Clawds, each with a name, a body color #rrggbb (the first is usually Clawd, ${CLAWD_COLOR}) and a look or null. look (like Clawd's stickers: coffee, headphones, a wand, a crown, sunglasses...): eyes one of ${EYES.join(', ')}; shiny true for a holographic shimmer (rarely); hat 0 to ${HAT_H} rows of up to ${HAT_W} characters on the head; held 0 to ${HELD_H} rows of up to ${HELD_W} characters in a hand.`,
    `props: 0 to ${MAX_PROPS}, each with a short lowercase id, x from 0 (left) to 1 (right), motion one of ${MOTIONS.join(', ')}, an effect that keeps going around it (or "none"), and 1 to 3 frames of up to ${PROP_H} rows of up to ${PROP_W} characters. Props can be instruments, vehicles, food, tools, animals, signs, anything: draw them recognizable.`,
    'Pixel rows: "." is empty, a color letter is a pixel; colors map 1 to 4 single uppercase letters to bright #rrggbb. Pixels are small (a Clawd is 28 × 14 of them), so draw with detail: outlines, highlights, recognizable shapes.',
    `beats: 2 to ${MAX_BEATS}, played in order; secs 1 to 6. Each beat has 1 to ${MAX_ACTS} acts done at the same time, one per Clawd (who: a cast name); Clawds without an act look on.`,
    `An act: do one of ${ACTIONS.join(', ')}; to (0 to 1) where he goes, or where a thrown prop lands; prop: the prop he acts on; with: the Clawd he acts with; effect one of ${EFFECTS.join(', ')}; say: a line.`,
    `moves: 0 to ${MAX_MOVES} moves you invent for this skit when no action fits (a moonwalk, a robot dance, a victory stomp, a sword lunge). Each has a name (one lowercase word, not an action's name), tempo 1 to 8 (tenths of a second a pose), an effect, and 1 to ${MAX_MOVE_FRAMES} poses played in a loop: left and right arm one of ${ARMS.join(', ')} (mid is held up in front); legs one of ${LEGS.join(', ')}; lift -1 to 5 pixels off the floor; dx -3 to 3 pixels sideways; low true to crouch; flip true to face the other way; eyes one of ${EYES.join(', ')} or null. An act does a move by its name in "do"; with "to" he travels while doing it.`,
    'Meaning: carry lifts the prop overhead and takes it to "to"; throw hurls it in an arc (with a partner, the partner catches it); push shoves it along; ride gets in or on it (a car, a boat, a broom, a rocket) and the world rolls by; fly and swim move through the air or water; strum, drum, blow and keys play the prop as a string instrument, drums, a horn or a keyboard; eat, read and hold use it in his hands; hide ducks behind it; highfive, hug, chase and follow need with; punch and kick may hit a prop or a partner, who reels; cast throws magic at a prop or a partner. ' +
      'More: clap, point (at a prop or partner), nod, refuse (shakes his head), laugh, cry, stretch, sneak and march and crawl and roll (move to "to"), flip (a somersault), salute, sing, panic, faint, meditate (floats cross-legged), teleport (vanishes, reappears at "to"), kneel (to a partner: a proposal). ' +
      'With a prop: juggle it, stir it (a pot), type on it, drink it, call on it (a phone), sweep with it (a broom), climb on top of it, photo (snap a partner with a camera). ' +
      'With a partner: handshake, argue, lift (holds him overhead), scare (he jumps), waltz (they dance together).',
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
    return mendedObject(text, start)
  }
}

/**
 * The JSON object starting at `start`, its closing brackets mended where a
 * model mixed them up (small models do, deep in nested arrays): a closer that
 * doesn't match closes whatever is open above the bracket it matches, and one
 * that matches nothing open is dropped. Null if it still can't be read.
 */
export function mendedObject(text: string, start: number): unknown {
  const open: string[] = []
  // Each open object's keys so far (null for an array).
  const keys: (Set<string> | null)[] = []
  let out = ''
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      const key = /^"((?:[^"\\]|\\.)*)"\s*:/.exec(text.slice(i, i + 200))?.[1]
      if (key !== undefined) {
        // A key where an array is open: the model forgot to close it (and maybe more).
        if (open[open.length - 1] === ']') {
          const comma = /,\s*$/.test(out)
          out = out.replace(/,\s*$/, '')
          while (open[open.length - 1] === ']') {
            out += open.pop()
            keys.pop()
          }
          if (comma) out += ','
        }
        // A key said twice in an object that is an item of a list: two items run together.
        const seen = keys[keys.length - 1]
        if (seen?.has(key) && open[open.length - 2] === ']') {
          out = out.replace(/,\s*$/, '') + '},{'
          seen.clear()
        }
        seen?.add(key)
      }
      inString = true
    }
    if (ch === '{' || ch === '[') {
      open.push(ch === '{' ? '}' : ']')
      keys.push(ch === '{' ? new Set() : null)
    } else if (ch === '}' || ch === ']') {
      const at = open.lastIndexOf(ch)
      // Matches nothing open, or would end the whole object while more keys follow: stray.
      if (at < 0 || (at === 0 && /^\s*,\s*"[^"]*"\s*:/.test(text.slice(i + 1, i + 200)))) continue
      while (open.length > at + 1) {
        out += open.pop()
        keys.pop()
      }
      out += open.pop()
      keys.pop()
      if (open.length === 0) {
        try {
          return JSON.parse(out)
        } catch {
          return null
        }
      }
      continue
    }
    out += ch
  }
  return null
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
/** A title or caption without an episode number up front ("Ep4: ", "Episode 2 - "): the stage shows the number itself. */
const unnumbered = (text: string | null): string | null => {
  if (text === null) return null
  const rest = text.replace(/^\s*(?:ep(?:isode)?\.?\s*\d+|第\s*\d+\s*集)\s*[:：.\-–—]?\s*/i, '')
  return rest.length > 0 ? rest : null
}

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
    out.push({ id, frames, colors, x: fraction(item.x) ?? 0.6, motion: oneOf(MOTIONS, item.motion, 'still'), effect: oneOf(EFFECTS, item.effect, 'none') })
  }
  return out
}

function readCast(item: Record<string, unknown>): SkitActor[] {
  const out: SkitActor[] = []
  for (const raw of Array.isArray(item.cast) ? item.cast.slice(0, MAX_CAST) : []) {
    if (!isRecord(raw)) continue
    const name = line(raw.name, NAME_W)
    if (!name || isPlaceholder(name) || out.some(a => a.name.toLowerCase() === name.toLowerCase())) continue
    out.push({ name, color: hexOf(raw.color) ?? (out.length === 0 ? CLAWD_COLOR : CAST_COLORS[out.length - 1]!), look: readLook(raw.look) })
  }
  // No cast (or the shape before casts): Clawd alone, in the skit's look if it has one.
  return out.length > 0 ? out : [{ name: 'Clawd', color: CLAWD_COLOR, look: readLook(item.look) }]
}

/** A cast member named by name (any case) or index, or null. */
function whoOf(v: unknown, cast: readonly SkitActor[]): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < cast.length) return v
  if (typeof v !== 'string') return null
  const at = cast.findIndex(a => a.name.toLowerCase() === v.trim().toLowerCase())
  return at >= 0 ? at : null
}

function readMoves(raw: unknown): SkitMove[] {
  const out: SkitMove[] = []
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0)
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_MOVES) : []) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' ? item.name.trim().toLowerCase().slice(0, 16) : ''
    // A move may not take a built-in action's name, or another move's.
    if (!name || (ACTIONS as readonly string[]).includes(name) || name === 'move' || out.some(m => m.name === name)) continue
    const frames: MoveFrame[] = []
    for (const f of Array.isArray(item.frames) ? item.frames.slice(0, MAX_MOVE_FRAMES) : []) {
      if (!isRecord(f)) continue
      frames.push({
        left: oneOf(ARMS, f.left, 'out'),
        right: oneOf(ARMS, f.right, 'out'),
        legs: oneOf(LEGS, f.legs, 'stand'),
        lift: num(f.lift, -1, 5),
        dx: num(f.dx, -3, 3),
        low: f.low === true,
        flip: f.flip === true,
        eyes: EYES.find(e => e === f.eyes) ?? null,
      })
    }
    if (frames.length === 0) continue
    out.push({ name, tempo: Math.max(1, Math.min(8, num(item.tempo, 1, 8) || 3)), frames, effect: oneOf(EFFECTS, item.effect, 'none') })
  }
  return out
}

function readAct(item: Record<string, unknown>, cast: readonly SkitActor[], props: readonly SkitProp[], moves: readonly SkitMove[] = []): SkitAct | null {
  const said0 = typeof item.do === 'string' ? item.do.trim().toLowerCase() : ''
  // One of the skit's own moves, named in `do` (or as `do: "move", move: name`).
  const own = moves.find(m => m.name === said0) ?? (said0 === 'move' ? moves.find(m => m.name === String(item.move ?? '').trim().toLowerCase()) : undefined)
  if (own) {
    const who = whoOf(item.who, cast) ?? 0
    const said = line(item.say, SAY_W) ?? ''
    return { who, do: 'move', move: own.name, to: fraction(item.to), prop: null, with: null, effect: oneOf(EFFECTS, item.effect, 'none'), say: isPlaceholder(said) ? '' : said }
  }
  const action = ACTIONS.find(a => a === item.do) ?? (said0 === 'move' ? 'dance' : undefined)
  if (!action) return null
  const who = whoOf(item.who, cast) ?? 0
  const named = typeof item.prop === 'string' ? item.prop.trim().toLowerCase() : null
  const prop = named && props.some(p => p.id === named) ? named : null
  const partner = whoOf(item.with, cast)
  const withWho = partner !== null && partner !== who ? partner : null
  // An act missing the prop or partner it needs is the plain act instead.
  let act: Action = action
  if (!prop && WITHOUT_PROP[act]) act = WITHOUT_PROP[act]!
  if (withWho === null && WITHOUT_PARTNER[act]) act = WITHOUT_PARTNER[act]!
  const said = line(item.say, SAY_W) ?? ''
  return { who, do: act, to: fraction(item.to), prop, with: withWho, effect: oneOf(EFFECTS, item.effect, 'none'), say: isPlaceholder(said) ? '' : said }
}

function readBeats(raw: unknown, cast: readonly SkitActor[], props: readonly SkitProp[], moves: readonly SkitMove[] = []): SkitBeat[] {
  const out: SkitBeat[] = []
  let total = 0
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_BEATS) : []) {
    if (!isRecord(item)) continue
    // A beat of acts, or (the shape before casts) one act itself.
    const list = Array.isArray(item.acts) ? item.acts : [item]
    const acts: SkitAct[] = []
    for (const a of list.slice(0, MAX_ACTS)) {
      const act = isRecord(a) ? readAct(a, cast, props, moves) : null
      if (act && !acts.some(b => b.who === act.who)) acts.push(act)
    }
    if (acts.length === 0) continue
    const secs = typeof item.secs === 'number' && Number.isFinite(item.secs) ? Math.min(6, Math.max(1, item.secs)) : 2
    if (total + secs > MAX_SECS) break
    total += secs
    const caption = unnumbered(line(item.caption, CAPTION_W))
    out.push({ secs, acts, ...(caption && !isPlaceholder(caption) ? { caption } : {}) })
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
  let list: unknown[] = isRecord(data) && Array.isArray(data.skits) ? data.skits : []
  // Each skit on its own, from where its title starts: a mended reply may lose some read whole.
  const one = [...text.matchAll(/\{\s*"title"/g)].map(m => mendedObject(text, m.index!)).filter(isRecord)
  if (one.length > list.length) list = one
  const out: MuseSkit[] = []
  for (const item of list.slice(0, 4)) {
    if (!isRecord(item)) continue
    const title = unnumbered(line(item.title, TITLE_W))
    if (!title || isPlaceholder(title)) continue
    const cast = readCast(item)
    // Props copied from the format example (even with a few pixels changed) are not the model's own.
    const props = readProps(item.props).filter(p => !p.frames.some(f => EXAMPLE.props.some(e => e.frames.some(ef => alike(f, ef)))))
    const moves = readMoves(item.moves)
    const beats = readBeats(item.beats, cast, props, moves)
    if (beats.length < 2) continue
    // Only the moves some act uses.
    const used = moves.filter(m => beats.some(b => b.acts.some(a => a.move === m.name)))
    const summary = line(item.summary, SUMMARY_W)
    out.push({ kind, title, place: readPlace(item.place), cast, props, ...(used.length > 0 ? { moves: used } : {}), beats, ...(summary && !isPlaceholder(summary) ? { summary } : {}) })
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

/** Whether the series is due a new episode at `now`: none yet, or none made in `EPISODE_EVERY_MS`. */
export function episodeDue(muse: Muse, now: number): boolean {
  const newest = Math.max(0, ...muse.skits.map(s => (s.episode !== undefined ? s.at ?? 0 : 0)))
  return now - newest >= EPISODE_EVERY_MS
}

/** Whether this chance asks the muse for skits for `kind`: always when few are kept or (given `now`) the series is due, else as the seed says. */
export function museNeed(muse: Muse, kind: Kind, seed: number, now?: number): boolean {
  if (skitsFor(muse, kind).length < MUSE_LOW) return true
  if (now !== undefined && episodeDue(muse, now)) return true
  return (seed >>> 8) % 100 < MUSE_CHANCE
}
