// What the views draw from: each session's turn (from opencode's events), the
// pet's stats and mood, the theme, the preview and the audio tap. Reactive
// (Solid stores and signals); plugin.tsx draws it.
import type { Plugin } from '@opencode/plugin/tui'
import { createEffect, createRoot, createSignal } from 'solid-js'
import { createStore, produce } from 'solid-js/store'

import { AudioMeter } from './audio'
import type { AudioFeed } from './audio'
import type { Choice, Config } from './config'
import { m } from './i18n'
import { bubbleOf, busyLabel, formatDuration, levelOf, newsOf, toolLabel } from './pet'
import type { News } from './pet'
import { PET_W, dockPetOf, petArtOf } from './pets'
import type { PetState } from './pets'
import { startTap } from './tap'
import type { TapStatus } from './tap'
import { FINALE_MS, THEMES, isThemeName, pickRandom } from './themes'
import type { Act, Finale, Mood, ThemeName } from './themes'
import type { DockPet } from './types'

const PREVIEW_MS = 8000
/** How long the pet speaks of tests or a commit. */
const NEWS_MS = 4000
/** How long a pat's hearts float. */
const PAT_MS = 2500
/** Quiet this long after a turn, the companion dozes off. */
const SLEEP_MS = 5 * 60_000

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
}

const IDLE: Run = { isTurn: false, act: 'think', running: {}, started: 0, finale: null, mood: 'hello', news: null }

type Prefs = { theme: Choice | null; visible: boolean | null; stage: boolean | null; companion: boolean | null }

const TONE: Partial<Record<PetState, DockPet['tone']>> = { ask: 'ask', error: 'error', aborted: 'aborted', sleep: 'sleep' }

export type Spinner = ReturnType<typeof createSpinner>

export function createSpinner(context: Plugin.Context, config: Config) {
  const [prefs, updatePrefs] = context.storage.store<Prefs>('prefs', {
    initial: { theme: null, visible: null, stage: null, companion: null },
  })
  const [pet, updatePet] = context.storage.store('pet', { initial: { xp: 0, love: 0 } })
  // The theme drawn now, kept over hot reloads so `random` does not reroll.
  const [drawn, setDrawn] = context.storage.memory('drawn', { initial: { theme: '', choice: '' } })
  const [runs, setRuns] = createStore<Record<string, Run>>({})
  // Questions and permission requests waiting, by root session.
  const [asks, setAsks] = createStore<Record<string, Record<string, true>>>({})
  const [pat, setPat] = createSignal<string | null>(null)
  const [preview, setPreview] = createSignal<{ theme: ThemeName; id: string } | null>(null)
  const [tap, setTap] = createSignal<TapStatus & { isLive: boolean }>({ isLive: false, isAudible: false, error: null })
  const meter = new AudioMeter()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const sleepTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Each call's tool and command, for the news a shell command brings.
  const calls = new Map<string, { sid: string; tool: string; command?: string }>()

  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  // ---- settings ----------------------------------------------------------

  const choice = (): Choice => prefs.theme ?? config.theme
  const isVisible = () => prefs.visible ?? config.isVisible
  const hasStage = () => prefs.stage ?? config.hasStage
  const hasCompanion = () => prefs.companion ?? config.hasCompanion
  const theme = (): ThemeName => (isThemeName(drawn.theme) ? drawn.theme : 'clawd')

  /** Draws the theme a choice names; `random` keeps the one already drawn unless `isFresh`. */
  function choose(picked: Choice, isFresh = false): ThemeName {
    const keep = !isFresh && picked === 'random' && drawn.choice === 'random' && isThemeName(drawn.theme)
    const name = picked !== 'random' ? picked : keep ? (drawn.theme as ThemeName) : pickRandom(Date.now())
    setDrawn(d => {
      d.theme = name
      d.choice = picked
    })
    return name
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
      context.ui.toast.show({ message: m('pet.levelUp', { theme: theme(), level: levelOf(before + 1) }), variant: 'success' })
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
      })
    }),
    on('session.reasoning.started', e => {
      const sid = own(e.data.sessionID)
      if (sid && run(sid).isTurn) edit(sid, r => void (Object.keys(r.running).length === 0 && (r.act = 'think')))
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

  // ---- the pet -----------------------------------------------------------

  // Frames of the loops shown lately, by loop id: a new bubble keeps its frames.
  const loops = new Map<string, DockPet>()

  /** The pet for a session as it is now, or null while it is off. */
  function dockOf(sid: string): DockPet | null {
    if (!isVisible() || !hasCompanion()) return null
    const name = theme()
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
      loop = dockPetOf(petArtOf(name, THEMES[name].color), state, view, patId !== null, config.isStill)
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

  function showPreview(name: ThemeName): void {
    const id = String(Date.now())
    setPreview({ theme: name, id })
    later(PREVIEW_MS, () => {
      if (preview()?.id === id) setPreview(null)
    })
  }

  // ---- reactive upkeep ---------------------------------------------------

  let tapper: { stop: () => void } | null = null
  const disposeRoot = createRoot(dispose => {
    // The theme follows its choice; a `random` already drawn stays.
    createEffect(() => {
      const picked = choice()
      if (picked !== drawn.choice || !isThemeName(drawn.theme)) choose(picked)
    })
    // The tap runs exactly while the audio theme's band can show.
    createEffect(() => {
      const wants = theme() === 'audio' && isVisible() && hasStage()
      if (wants && !tapper) {
        setTap({ isLive: true, isAudible: false, error: null })
        tapper = startTap(meter, status => setTap({ ...status, isLive: true }))
      } else if (!wants && tapper) {
        tapper.stop()
        tapper = null
        setTap({ isLive: false, isAudible: false, error: null })
      }
    })
    return dispose
  })

  /** What the audio scene is fed: live levels, null when the tap cannot run, undefined for the made-up signal. */
  function audioFeed(name: ThemeName): AudioFeed {
    const status = tap()
    if (name !== 'audio' || !status.isLive) return undefined
    return status.error ? null : meter.view()
  }

  return {
    config,
    prefs,
    pet,
    theme,
    choice,
    isVisible,
    hasStage,
    hasCompanion,
    preview,
    tap,
    rootOf,
    run,
    /** The label of the tool a session runs now (the latest, subagents counted). */
    toolOf: (sid: string) => busyLabel(Object.values(run(sid).running)),
    stateOf,
    dockOf,
    audioFeed,
    choose,
    patPet,
    showPreview,
    /** Sets a switch, kept across restarts. */
    setSwitch(field: 'visible' | 'stage' | 'companion', isOn: boolean) {
      void updatePrefs(d => void (d[field] = isOn))
    },
    setChoice(picked: Choice): ThemeName {
      const name = choose(picked, true)
      void updatePrefs(d => void (d.theme = picked))
      return name
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
