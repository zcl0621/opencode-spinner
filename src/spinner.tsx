// What the views draw from: each session's turn (from opencode's events), the
// pet's stats and mood, the muse's content and the sound seed. Reactive (Solid
// stores and signals); plugin.tsx draws it.
import type { Plugin } from '@opencode/plugin/tui'
import { createEffect, createRoot, createSignal } from 'solid-js'
import { createStore, produce } from 'solid-js/store'

import { SoundSeed, seedFrom } from './audio'
import type { Config } from './config'
import { lang, m } from './i18n'
import { kindOf, lightestVariant, museNeed, parseModel, parseSkits, skitPrompt } from './muse'
import type { Muse, MuseSkit } from './muse'
import { bubbleOf, busyLabel, formatDuration, levelOf, newsOf, toolLabel } from './pet'
import type { News } from './pet'
import { CLAWD_PET, PET_W, dockPetOf } from './pets'
import type { PetState } from './pets'
import { startTap } from './tap'
import type { TapStatus } from './tap'
import { FINALE_MS } from './themes'
import type { Act, Finale, Mood } from './themes'
import type { DockPet } from './types'

/** How long the pet speaks of tests or a commit. */
const NEWS_MS = 4000
/** How long a pat's hearts float. */
const PAT_MS = 2500
/** Quiet this long after a turn, the companion dozes off. */
const SLEEP_MS = 5 * 60_000
/** A chance to ask the muse comes at most this often while turns run; it gives up after the timeout, and keeps this many of each kind. */
const MUSE_EVERY_MS = 40_000
const MUSE_TIMEOUT_MS = 300_000
const MUSE_KEEP = 500

/** The muse's state, for `/spinner status`. */
export type MuseState = { isBusy: boolean; error: string | null; via: string | null; at: number; made: number }
/** The latest seed and where it came from. */
export type SeedState = { seed: number; from: 'sound' | 'random' } | null

export type FinaleState = { kind: Finale; label: string; id: string }

/** One root session's turn, as the band and the pet tell it. */
export type Run = {
  isTurn: boolean
  /** What the turn does now; a waiting question or permission shows as `ask` on top (see `stateOf`). */
  act: Act
  /** Tool calls running now, by call id: their labels. */
  running: Record<string, string>
  started: number
  finale: FinaleState | null
  mood: Mood
  news: { kind: News; id: string } | null
  /** The turn's seed: the show's order of scenes and its parks follow it. */
  seed: number
}

const IDLE: Run = { isTurn: false, act: 'think', running: {}, started: 0, finale: null, mood: 'hello', news: null, seed: 0 }

/** What the footer toggle sets; null follows the option. */
type Prefs = { visible: boolean | null }

const TONE: Partial<Record<PetState, DockPet['tone']>> = { ask: 'ask', error: 'error', aborted: 'aborted', sleep: 'sleep' }

export type Spinner = ReturnType<typeof createSpinner>

export function createSpinner(context: Plugin.Context, config: Config) {
  const [prefs, updatePrefs] = context.storage.store<Prefs>('prefs', { initial: { visible: null } })
  const [pet, updatePet] = context.storage.store('pet', { initial: { xp: 0, love: 0 } })
  const [runs, setRuns] = createStore<Record<string, Run>>({})
  // Questions and permission requests waiting, by root session.
  const [asks, setAsks] = createStore<Record<string, Record<string, true>>>({})
  const [pat, setPat] = createSignal<string | null>(null)
  const [tap, setTap] = createSignal<TapStatus & { isLive: boolean }>({ isLive: false, isAudible: false, error: null })
  const [lastSeed, setLastSeed] = createSignal<SeedState>(null)
  const sound = new SoundSeed()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const sleepTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Each call's tool and command, for the news a shell command brings.
  const calls = new Map<string, { sid: string; tool: string; command?: string }>()
  // What the muse wrote, newest first, and how it is doing.
  // Kept across restarts (and shared by every opencode open): a turn opens with the last ones.
  const [muse, updateMuse] = context.storage.store<{ skits?: MuseSkit[] }>('muse', { initial: { skits: [] } })
  const [museState, setMuseState] = createSignal<MuseState>({ isBusy: false, error: null, via: null, at: 0, made: 0 })
  // Set once opencode's free tier turns a direct call down: from then on, ask through the session.
  let viaSession = false

  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  // ---- settings ----------------------------------------------------------

  const isVisible = () => prefs.visible ?? config.isVisible
  const hasStage = () => config.hasStage
  const hasCompanion = () => config.hasCompanion
  const modelText = (): string | null => config.model

  /** A fresh seed: from the sound while something plays, else from crypto. */
  function freshSeed(): number {
    const made = seedFrom(tap().isLive && !tap().error ? sound : null)
    setLastSeed(made)
    return made.seed
  }

  // ---- sessions ----------------------------------------------------------

  /** The session a subagent's session belongs to; the band shows the root's turn. */
  function rootOf(sid: string): string {
    try {
      return context.data.session.root(sid) || sid
    } catch {
      return sid
    }
  }

  const run = (sid: string): Run => runs[sid] ?? IDLE
  const isAsking = (sid: string) => Object.keys(asks[sid] ?? {}).length > 0

  function edit(sid: string, fn: (r: Run) => void): void {
    if (!runs[sid]) setRuns(sid, { ...IDLE, running: {} })
    setRuns(sid, produce(fn))
  }

  /** What the pet shows for a session: the turn's act while it runs (a waiting ask first), else its mood. */
  function stateOf(sid: string): PetState {
    const r = run(sid)
    if (isAsking(sid)) return 'ask'
    return r.isTurn ? r.act : r.mood
  }

  /** Busy with the latest tool still running, else back to thinking. */
  function settle(r: Run): void {
    r.act = Object.keys(r.running).length > 0 ? 'tool' : 'think'
  }

  function gainXp(): void {
    const before = pet.xp
    void updatePet(d => void (d.xp += 1))
    if (levelOf(before + 1) > levelOf(before)) {
      context.ui.toast.show({ message: m('pet.levelUp', { theme: 'Clawd', level: levelOf(before + 1) }), variant: 'success' })
    }
  }

  function noteNews(sid: string, command: string, isError: boolean): void {
    const kind = newsOf(command, isError)
    if (kind === null) return
    const id = `${Date.now()}`
    edit(sid, r => void (r.news = { kind, id }))
    if (kind !== 'testFail') gainXp()
    later(NEWS_MS, () => {
      if (run(sid).news?.id === id) edit(sid, r => void (r.news = null))
    })
  }

  function endTurn(sid: string, kind: Finale): void {
    const r = run(sid)
    if (!r.isTurn) return
    const ms = Date.now() - r.started
    const id = `${sid}:${Date.now()}`
    const label = kind === 'answer' ? m('finale.done', { time: formatDuration(ms) }) : m(kind === 'aborted' ? 'finale.aborted' : 'finale.error')
    edit(sid, r => {
      r.isTurn = false
      r.running = {}
      r.act = 'think'
      r.mood = kind === 'answer' ? 'ready' : kind
      r.finale = config.hasFinale ? { kind, label, id } : null
    })
    setAsks(produce(all => void delete all[sid]))
    if (kind === 'answer') gainXp()
    clearTimeout(sleepTimers.get(sid))
    sleepTimers.set(
      sid,
      later(SLEEP_MS, () => edit(sid, r => void (r.mood = 'sleep'))),
    )
    if (config.hasFinale) {
      later(FINALE_MS, () => {
        if (run(sid).finale?.id === id) edit(sid, r => void (r.finale = null))
      })
    }
  }

  /** A session's own event (not a subagent's): the sid, or null. */
  const own = (sid: string) => (rootOf(sid) === sid ? sid : null)

  // One bad event must not take the band down with it.
  const on: typeof context.data.on = (type, handler) =>
    context.data.on(type, e => {
      try {
        handler(e)
      } catch (err) {
        console.error('opencode-spinner:', type, err)
      }
    })

  function ask(sid: string, key: string, isOpen: boolean): void {
    const root = rootOf(sid)
    // produce, not a merge: a merge never takes a key away.
    setAsks(
      produce(all => {
        if (isOpen) (all[root] ??= {})[key] = true
        else if (all[root]) delete all[root]![key]
      }),
    )
  }
  const offs = [
    on('session.execution.started', e => {
      const sid = own(e.data.sessionID)
      if (!sid) return
      clearTimeout(sleepTimers.get(sid))
      edit(sid, r => {
        r.isTurn = true
        r.act = 'think'
        r.running = {}
        r.started = Date.now()
        r.finale = null
        r.seed = freshSeed()
      })
      inspire(sid, true)?.catch(() => {})
    }),
    on('session.reasoning.started', e => {
      const sid = own(e.data.sessionID)
      if (sid && run(sid).isTurn) edit(sid, r => void (Object.keys(r.running).length === 0 && (r.act = 'think')))
      if (sid) inspire(sid)?.catch(() => {})
    }),
    on('session.text.started', e => {
      const sid = own(e.data.sessionID)
      if (sid && run(sid).isTurn) edit(sid, r => void (Object.keys(r.running).length === 0 && (r.act = 'say')))
    }),
    on('session.tool.input.started', e => {
      const sid = own(e.data.sessionID)
      if (!sid) return
      calls.set(e.data.id, { sid, tool: e.data.name })
      edit(sid, r => {
        r.running[e.data.id] = e.data.name
        r.act = 'tool'
      })
    }),
    on('session.tool.called', e => {
      const sid = own(e.data.sessionID)
      if (!sid) return
      const tool = calls.get(e.data.id)?.tool ?? 'tool'
      const input = (e.data.input ?? {}) as Record<string, unknown>
      calls.set(e.data.id, { sid, tool, command: typeof input.command === 'string' ? input.command : undefined })
      edit(sid, r => {
        r.running[e.data.id] = toolLabel({ ...input, tool })
        r.act = 'tool'
      })
      inspire(sid)?.catch(() => {})
    }),
    ...(['session.tool.success', 'session.tool.failed'] as const).map(type =>
      on(type, e => {
        const sid = own(e.data.sessionID)
        const call = calls.get(e.data.id)
        calls.delete(e.data.id)
        if (!sid) return
        edit(sid, r => {
          delete r.running[e.data.id]
          settle(r)
        })
        if (call?.tool === 'shell' && call.command) {
          const exit = (e.data.metadata as { exit?: unknown } | undefined)?.exit
          noteNews(sid, call.command, type === 'session.tool.failed' || (typeof exit === 'number' && exit !== 0))
        }
      }),
    ),
    on('permission.asked', e => ask(e.data.sessionID, `p:${e.data.id}`, true)),
    on('permission.replied', e => ask(e.data.sessionID, `p:${e.data.requestID}`, false)),
    on('form.created', e => ask(e.data.form.sessionID, `f:${e.data.form.id}`, true)),
    on('form.replied', e => ask(e.data.sessionID, `f:${e.data.id}`, false)),
    on('form.cancelled', e => ask(e.data.sessionID, `f:${e.data.id}`, false)),
    on('session.execution.succeeded', e => {
      const sid = own(e.data.sessionID)
      if (sid) endTurn(sid, 'answer')
    }),
    on('session.execution.failed', e => {
      const sid = own(e.data.sessionID)
      if (sid) endTurn(sid, 'error')
    }),
    on('session.execution.interrupted', e => {
      const sid = own(e.data.sessionID)
      if (sid) endTurn(sid, 'aborted')
    }),
  ]

  // ---- the muse ----------------------------------------------------------

  /** The skits kept (a store from before skits has none). */
  const museOf = (): Muse => ({ skits: muse.skits ?? [] })

  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, reject) => later(ms, () => reject(new Error(`no reply in ${ms / 1000}s`))))])

  // Each model's lightest reasoning variant, looked up once: the muse needs no long thinking.
  const variants = new Map<string, string | undefined>()
  async function variantOf(providerID: string, id: string): Promise<string | undefined> {
    const key = `${providerID}/${id}`
    if (!variants.has(key)) {
      try {
        const listed = await context.client.model.list()
        const model = listed.data.find(m => m.providerID === providerID && m.id === id)
        variants.set(key, lightestVariant((model?.variants ?? []).map(v => v.id)))
      } catch {
        variants.set(key, undefined)
      }
    }
    return variants.get(key)
  }

  /** One prompt to the muse's model; the text and the way it went. */
  async function askModel(prompt: string, sid: string): Promise<{ text: string; via: string }> {
    const pick = parseModel(modelText())
    if (!pick) throw new Error('no model set')
    const bySession = async () => ({ text: (await context.client.session.generate({ sessionID: sid, prompt })).text, via: 'session' })
    if (pick === 'session' || viaSession) return bySession()
    try {
      const variant = await variantOf(pick.providerID, pick.id)
      const reply = await context.client.generate.text({ prompt, model: { providerID: pick.providerID, id: pick.id, ...(variant ? { variant } : {}) } })
      return { text: reply.text, via: `${pick.providerID}/${pick.id}${variant ? ` (${variant})` : ''}` }
    } catch (err) {
      // opencode's free models answer only inside a session: go through the session's own model.
      if (!/free tier|within opencode/i.test(String((err as Error)?.message ?? err))) throw err
      viaSession = true
      return bySession()
    }
  }

  /**
   * A chance to ask the muse for new content, unless it is off, busy, or had a
   * chance lately (`isEager`: sooner, at a turn's start). A fresh seed decides
   * whether it asks and for what (muse.ts, `museNeed`); `isForced` always asks.
   * Meanwhile the scene plays what is kept. Resolves to what it wrote.
   */
  function inspire(sid: string, isEager = false, isForced = false): Promise<string[]> | null {
    const state = museState()
    if (!isVisible() || !hasStage() || !parseModel(modelText()) || state.isBusy) return null
    if (!isForced && Date.now() - state.at < (isEager ? 15_000 : MUSE_EVERY_MS)) return null
    const seed = freshSeed()
    setMuseState({ ...state, at: Date.now() })
    const r = run(sid)
    const tool = busyLabel(Object.values(r.running)) || undefined
    // Skits for what the agent does now; an ask has none of its own.
    const kind = kindOf(r.act, tool) ?? 'think'
    if (!isForced && !museNeed(museOf(), kind, seed)) return null
    const prompt = skitPrompt(kind, tool, lang(), seed)
    setMuseState(s => ({ ...s, isBusy: true }))
    return withTimeout(askModel(prompt, sid), MUSE_TIMEOUT_MS)
      .then(({ text, via }) => {
        const made = parseSkits(text, kind)
        if (made.length === 0) throw new Error(`nothing usable in the reply: ${text.slice(0, 80)}`)
        void updateMuse(d => void (d.skits = [...made, ...(d.skits ?? [])].slice(0, MUSE_KEEP)))
        setMuseState(s => ({ ...s, isBusy: false, error: null, via, made: s.made + made.length }))
        return made.map(skit => skit.title)
      })
      .catch(err => {
        const error = String((err as Error)?.message ?? err).split('\n')[0]!.slice(0, 160)
        console.error('opencode-spinner muse:', error)
        setMuseState(s => ({ ...s, isBusy: false, error }))
        throw new Error(error)
      })
  }

  // ---- the pet -----------------------------------------------------------

  // Frames of the loops shown lately, by loop id: a new bubble keeps its frames.
  const loops = new Map<string, DockPet>()

  /** The pet for a session as it is now, or null while it is off. */
  function dockOf(sid: string): DockPet | null {
    if (!isVisible() || !hasCompanion()) return null
    const name = 'clawd'
    const state = stateOf(sid)
    const r = run(sid)
    const patId = pat()
    // A waiting ask outranks news: it is the one the person must act on.
    const said = state === 'ask' ? null : r.news
    const id = `${name}:${state}:${patId ?? ''}`
    const view = {
      id,
      bubble: said ? m(`pet.${said.kind}`) : bubbleOf(state, busyLabel(Object.values(r.running))),
      tone: said?.kind === 'testFail' ? ('error' as const) : (TONE[state] ?? ('plain' as const)),
      stats: `Lv.${levelOf(pet.xp)} ♥${pet.love}`,
    }
    let loop = loops.get(id)
    if (!loop) {
      if (loops.size > 40) loops.clear()
      loop = dockPetOf(CLAWD_PET, state, view, patId !== null, config.isStill)
      loops.set(id, loop)
    }
    return { ...loop, ...view }
  }

  /** A pat: hearts over the pet, one more point of affection, kept. */
  function patPet(): number {
    const love = pet.love + 1
    void updatePet(d => void (d.love += 1))
    const id = String(Date.now())
    setPat(id)
    for (const sid of Object.keys(runs)) if (runs[sid]!.mood === 'sleep') edit(sid, r => void (r.mood = 'hello'))
    later(PAT_MS, () => {
      if (pat() === id) setPat(null)
    })
    return love
  }

  // ---- reactive upkeep ---------------------------------------------------

  let tapper: { stop: () => void } | null = null
  const disposeRoot = createRoot(dispose => {
    // The tap listens while the band can show and the sound seed is on.
    createEffect(() => {
      const wants = config.hasSoundSeed && isVisible() && hasStage()
      if (wants && !tapper) {
        setTap({ isLive: true, isAudible: false, error: null })
        tapper = startTap(sound, status => setTap({ ...status, isLive: true }))
      } else if (!wants && tapper) {
        tapper.stop()
        tapper = null
        setTap({ isLive: false, isAudible: false, error: null })
      }
    })
    return dispose
  })

  return {
    config,
    prefs,
    pet,
    isVisible,
    hasStage,
    hasCompanion,
    tap,
    lastSeed,
    rootOf,
    run,
    /** The label of the tool a session runs now (the latest, subagents counted). */
    toolOf: (sid: string) => busyLabel(Object.values(run(sid).running)),
    /** What the muse wrote, for the scene; kept across restarts. */
    muse: (): Muse => museOf(),
    museState,
    modelText,
    /** Asks the muse now, whatever the timing and the seed. */
    inspireNow: (sid: string): Promise<string[]> | null => inspire(sid, true, true),
    stateOf,
    dockOf,
    patPet,
    /** The footer toggle: all animations on or off, kept across restarts. */
    setVisible(isOn: boolean) {
      void updatePrefs(d => void (d.visible = isOn))
    },
    petWidth: PET_W,
    dispose() {
      offs.forEach(off => off())
      timers.forEach(clearTimeout)
      tapper?.stop()
      disposeRoot()
    },
  }
}
