// The controller against a fake opencode context: events in, what the band
// and the pet show out. Run with `bun test --conditions browser` so Solid is
// its reactive build.
import { afterEach, expect, jest, test } from 'bun:test'
import type { Plugin } from '@opencode/plugin/tui'
import { createStore, produce } from 'solid-js/store'

import { readConfig } from '../src/config'
import { setLang } from '../src/i18n'
import { createSpinner } from '../src/spinner'
import type { Spinner } from '../src/spinner'
import { FINALE_MS } from '../src/themes'

setLang('en')

type Handler = (event: { type: string; data: unknown }) => void

function fake(options: Record<string, unknown> = {}, roots: Record<string, string> = {}, client: unknown = {}, shown?: { route: string | null; tabs?: string[] }, known?: Set<string>, running?: Set<string>) {
  const handlers = new Map<string, Set<Handler>>()
  const toasts: string[] = []
  const storage = <T extends object>(initial: T) => {
    const [value, set] = createStore<T>(structuredClone(initial))
    return [value, (fn: (draft: T) => void) => set(produce(fn))] as const
  }
  const context = {
    options,
    client,
    data: {
      on(type: string, handler: Handler) {
        if (!handlers.has(type)) handlers.set(type, new Set())
        handlers.get(type)!.add(handler)
        return () => handlers.get(type)!.delete(handler)
      },
      session: {
        root: (sid: string) => roots[sid] ?? sid,
        ...(known && { get: (sid: string) => (known.has(sid) ? { id: sid } : undefined), sync: async () => {} }),
        ...(running && {
          family: (sid: string) => [sid, ...Object.keys(roots).filter(c => roots[c] === sid)],
          status: (sid: string) => (running.has(sid) ? 'running' : 'idle'),
        }),
      },
    },
    storage: {
      store: (_key: string, o: { initial: object }) => storage(o.initial),
      memory: (_key: string, o: { initial: object }) => storage(o.initial),
    },
    ui: {
      toast: { show: (o: { message: string }) => toasts.push(o.message) },
      ...(shown && {
        router: { current: () => (shown.route ? { type: 'session', sessionID: shown.route } : { type: 'home' }) },
        tabs: { enabled: () => !!shown.tabs, list: () => (shown.tabs ?? []).map(sessionID => ({ sessionID, active: false, busy: false, attention: false })) },
      }),
    },
  } as unknown as Plugin.Context
  const spinner = createSpinner(context, readConfig(options))
  const emit = (type: string, data: unknown) => handlers.get(type)?.forEach(h => h({ type, data }))
  return { spinner, emit, toasts }
}

let current: Spinner | undefined
afterEach(() => current?.dispose())

/** No tap (it would build swiftc) and no model unless a test asks for them. */
function start(options?: Record<string, unknown>, roots?: Record<string, string>, client?: unknown, shown?: { route: string | null; tabs?: string[] }, known?: Set<string>, running?: Set<string>) {
  const f = fake({ sound: false, model: false, ...options }, roots, client, shown, known, running)
  current = f.spinner
  return f
}

const S = 'ses_a'

test('a turn: thinking, a tool with its label, saying, then the finale and xp', () => {
  const { spinner, emit } = start()
  expect(spinner.stateOf(S)).toBe('hello')
  expect(spinner.dockOf(S)!.bubble).toBe('I’m here with you~')

  emit('session.execution.started', { sessionID: S })
  expect(spinner.run(S).isTurn).toBe(true)
  expect(spinner.stateOf(S)).toBe('think')

  emit('session.tool.input.started', { sessionID: S, id: 'c1', name: 'shell' })
  expect(spinner.stateOf(S)).toBe('tool')
  expect(spinner.dockOf(S)!.bubble).toBe('shell')
  emit('session.tool.called', { sessionID: S, id: 'c1', input: { command: 'ls -la' } })
  expect(spinner.dockOf(S)!.bubble).toBe('shell: ls -la')

  emit('session.tool.success', { sessionID: S, id: 'c1', metadata: { exit: 0 } })
  expect(spinner.stateOf(S)).toBe('think')
  emit('session.text.started', { sessionID: S })
  expect(spinner.stateOf(S)).toBe('say')

  emit('session.execution.succeeded', { sessionID: S })
  const r = spinner.run(S)
  expect(r.isTurn).toBe(false)
  expect(r.finale?.kind).toBe('answer')
  expect(r.finale?.label).toMatch(/^Done · \d+s$/)
  expect(spinner.stateOf(S)).toBe('ready')
  expect(spinner.dockOf(S)!.bubble).toBe('All done, take a look!')
  expect(spinner.pet.xp).toBe(1)
})

test('parallel tools: the pet stays busy until the last ends; subagents are counted', () => {
  const { spinner, emit } = start()
  emit('session.execution.started', { sessionID: S })
  for (const id of ['a', 'b', 'c']) {
    emit('session.tool.input.started', { sessionID: S, id, name: 'subagent' })
    emit('session.tool.called', { sessionID: S, id, input: { description: `task ${id}` } })
  }
  expect(spinner.dockOf(S)!.bubble).toBe('subagent ×3')
  emit('session.tool.success', { sessionID: S, id: 'a' })
  emit('session.tool.success', { sessionID: S, id: 'b' })
  expect(spinner.dockOf(S)!.bubble).toBe('subagent: task c')
  emit('session.tool.failed', { sessionID: S, id: 'c' })
  expect(spinner.stateOf(S)).toBe('think')
})

test('a permission prompt or a question shows as ask, also from a subagent, until answered', () => {
  const child = 'ses_child'
  const { spinner, emit } = start({}, { [child]: S })
  emit('session.execution.started', { sessionID: S })
  emit('permission.asked', { id: 'p1', sessionID: S })
  expect(spinner.stateOf(S)).toBe('ask')
  expect(spinner.dockOf(S)!.bubble).toBe('Waiting for your OK~')
  expect(spinner.dockOf(S)!.tone).toBe('ask')
  emit('permission.replied', { sessionID: S, requestID: 'p1' })
  expect(spinner.stateOf(S)).toBe('think')

  // A subagent's own tools are not news for the bubble; its asks are.
  emit('session.tool.input.started', { sessionID: child, id: 'x', name: 'read' })
  expect(spinner.stateOf(S)).toBe('think')
  emit('form.created', { form: { id: 'f1', sessionID: child } })
  expect(spinner.stateOf(S)).toBe('ask')
  emit('form.cancelled', { id: 'f1', sessionID: child })
  expect(spinner.stateOf(S)).toBe('think')

  // An ask still open when the turn ends does not outlive it.
  emit('permission.asked', { id: 'p2', sessionID: S })
  emit('session.execution.succeeded', { sessionID: S })
  expect(spinner.stateOf(S)).toBe('ready')
})

test('tests and commits the agent runs: a word from the pet, xp for good news', () => {
  const { spinner, emit } = start()
  emit('session.execution.started', { sessionID: S })
  const shell = (id: string, command: string, exit: number) => {
    emit('session.tool.input.started', { sessionID: S, id, name: 'shell' })
    emit('session.tool.called', { sessionID: S, id, input: { command } })
    emit('session.tool.success', { sessionID: S, id, metadata: { exit } })
  }
  shell('t1', 'bun test', 1)
  expect(spinner.dockOf(S)!.bubble).toBe('Tests failed… we’ll fix it')
  expect(spinner.dockOf(S)!.tone).toBe('error')
  expect(spinner.pet.xp).toBe(0)
  shell('t2', 'npm test', 0)
  expect(spinner.dockOf(S)!.bubble).toBe('Tests passed!')
  expect(spinner.pet.xp).toBe(1)
  shell('t3', 'git commit -m x', 0)
  expect(spinner.dockOf(S)!.bubble).toBe('Committed!')
  expect(spinner.pet.xp).toBe(2)
})

test('interrupted and failed turns', () => {
  const { spinner, emit, toasts } = start()
  emit('session.execution.started', { sessionID: S })
  emit('session.execution.interrupted', { sessionID: S })
  expect(spinner.run(S).finale).toMatchObject({ kind: 'aborted', label: 'Interrupted' })
  expect(spinner.stateOf(S)).toBe('aborted')
  emit('session.execution.started', { sessionID: S })
  emit('session.execution.failed', { sessionID: S })
  expect(spinner.run(S).finale).toMatchObject({ kind: 'error', label: 'Something went wrong' })
  expect(spinner.dockOf(S)!.bubble).toBe('Ouch… something broke')
  // An end with no turn running changes nothing.
  emit('session.execution.succeeded', { sessionID: S })
  expect(spinner.stateOf(S)).toBe('error')
  expect(spinner.pet.xp).toBe(0)
  expect(toasts).toEqual([])
})

test('a level brings a toast; a pat brings hearts and affection', () => {
  const { spinner, emit, toasts } = start()
  for (let i = 0; i < 2; i++) {
    emit('session.execution.started', { sessionID: S })
    emit('session.execution.succeeded', { sessionID: S })
  }
  expect(spinner.pet.xp).toBe(2)
  expect(toasts).toEqual(['Clawd reached Lv.2!'])
  const before = spinner.dockOf(S)!.id
  expect(spinner.patPet()).toBe(1)
  expect(spinner.pet.love).toBe(1)
  expect(spinner.dockOf(S)!.id).not.toBe(before)
  expect(spinner.dockOf(S)!.stats).toBe('Lv.2 ♥1')
})

test('the footer toggle hides the pet, and is kept; companion off hides it too', () => {
  const { spinner } = start()
  spinner.setVisible(false)
  expect(spinner.prefs.visible).toBe(false)
  expect(spinner.dockOf(S)).toBe(null)
  spinner.setVisible(true)
  expect(spinner.dockOf(S)).not.toBe(null)
  const quiet = start({ companion: false })
  expect(quiet.spinner.dockOf(S)).toBe(null)
  quiet.spinner.dispose()
})

test('each turn gets its own seed, from crypto with no sound', () => {
  const { spinner, emit } = start()
  emit('session.execution.started', { sessionID: S })
  const first = spinner.run(S).seed
  expect(spinner.lastSeed()).toEqual({ seed: first, from: 'random' })
  emit('session.execution.succeeded', { sessionID: S })
  emit('session.execution.started', { sessionID: S })
  expect(spinner.run(S).seed).not.toBe(first)
})

test('reduced motion: every pet loop is one still frame', () => {
  const { spinner } = start({ reducedMotion: true })
  expect(spinner.dockOf(S)!.order).toEqual([0])
})

test('a malformed event is ignored, not thrown', () => {
  const { spinner, emit } = start()
  const error = console.error
  console.error = () => {}
  try {
    expect(() => emit('form.created', {})).not.toThrow()
  } finally {
    console.error = error
  }
  emit('session.execution.started', { sessionID: S })
  expect(spinner.stateOf(S)).toBe('think')
})

test('timers: the finale clears after FINALE_MS, the pet dozes off after five quiet minutes', () => {
  jest.useFakeTimers()
  try {
    const { spinner, emit } = start()
    emit('session.execution.started', { sessionID: S })
    emit('session.execution.succeeded', { sessionID: S })
    expect(spinner.run(S).finale).not.toBe(null)
    jest.advanceTimersByTime(FINALE_MS + 1)
    expect(spinner.run(S).finale).toBe(null)
    expect(spinner.stateOf(S)).toBe('ready')
    jest.advanceTimersByTime(5 * 60_000)
    expect(spinner.stateOf(S)).toBe('sleep')
    expect(spinner.dockOf(S)!.bubble).toBe('Zzz…')
    // A pat wakes it.
    spinner.patPet()
    expect(spinner.stateOf(S)).toBe('hello')
  } finally {
    jest.useRealTimers()
  }
})

/** What a model would write for a skit prompt (hand-written here for the tests). */
const SKITS = JSON.stringify({
  skits: [
    { title: 'Bug hunt', props: [{ id: 'bug', x: 0.6, colors: { K: '#9ece6a' }, frames: [['.KK.', 'KKKK']] }], beats: [{ do: 'walk', prop: 'bug', secs: 2 }, { do: 'throw', prop: 'bug', secs: 2, effect: 'sparks', say: 'out!' }] },
    { title: 'Coffee break', beats: [{ do: 'sit', secs: 3 }, { do: 'cheer', secs: 2, effect: 'steam' }] },
  ],
})
const reply = (_prompt: string) => ({ text: SKITS })

test('the muse: asked at a turn\'s start with a seed and what the agent does; what it writes is kept', async () => {
  const asked: { prompt: string; model: unknown }[] = []
  const client = { generate: { text: async (input: { prompt: string; model: unknown }) => (asked.push(input), reply(input.prompt)) } }
  const { spinner, emit } = start({ model: 'anthropic/claude-haiku-4-5' }, {}, client)
  emit('session.execution.started', { sessionID: S })
  expect(spinner.museState().isBusy).toBe(true)
  await Bun.sleep(0)
  expect(asked.length).toBe(1)
  expect(asked[0]!.model).toEqual({ providerID: 'anthropic', id: 'claude-haiku-4-5' })
  expect(asked[0]!.prompt).toContain(`Random seed ${spinner.lastSeed()!.seed}`)
  expect(asked[0]!.prompt).toContain('thinking the task over')
  expect(spinner.muse().skits.map(k => [k.kind, k.title])).toEqual([['think', 'Bug hunt'], ['think', 'Coffee break']])
  expect(spinner.museState()).toMatchObject({ isBusy: false, error: null, via: 'anthropic/claude-haiku-4-5', made: 2 })
  // Asked lately: a tool call does not ask again.
  emit('session.tool.input.started', { sessionID: S, id: 'c1', name: 'shell' })
  emit('session.tool.called', { sessionID: S, id: 'c1', input: { command: 'bun test' } })
  await Bun.sleep(0)
  expect(asked.length).toBe(1)
  // Forced, it asks for skits about the work at hand, the tool in the prompt.
  await spinner.inspireNow(S)
  expect(asked[1]!.prompt).toContain('running shell commands')
  expect(asked[1]!.prompt).toContain('shell: bun test')
  expect(spinner.muse().skits.map(k => k.kind)).toEqual(['shell', 'shell', 'think', 'think'])
})

test('the muse: off without a model; the session by default; the free tier falls back to the session', async () => {
  let direct = 0
  const viaSession: string[] = []
  const client = {
    generate: { text: async () => (direct++, Promise.reject(new Error("Error from provider (Console): OpenCode's free tier can only be used from within OpenCode"))) },
    session: { generate: async (input: { sessionID: string; prompt: string }) => (viaSession.push(input.sessionID), reply(input.prompt)) },
  }
  const off = start({}, {}, client)
  off.emit('session.execution.started', { sessionID: S })
  expect(off.spinner.museState().isBusy).toBe(false)
  expect(off.spinner.inspireNow(S)).toBeNull()
  off.spinner.dispose()
  const byDefault = fake({ sound: false }, {}, client)
  await byDefault.spinner.inspireNow(S)
  expect([direct, viaSession.length]).toEqual([0, 1])
  byDefault.spinner.dispose()

  const { spinner } = start({ model: 'opencode/nemotron-3.5-lightning-free' }, {}, client)
  await spinner.inspireNow(S)
  expect([direct, viaSession.length]).toEqual([1, 2])
  expect(spinner.museState().via).toBe('session')
  // From then on straight through the session.
  await spinner.inspireNow(S)
  expect([direct, viaSession.length]).toEqual([1, 3])
})

test('the muse: a reply with nothing usable, or an error, is reported and drops nothing', async () => {
  let answer: () => Promise<{ text: string }> = async () => ({ text: SKITS })
  const client = { generate: { text: () => answer() } }
  const { spinner } = start({ model: 'a/b' }, {}, client)
  answer = async () => ({ text: 'Sorry, I cannot help with skits.' })
  await expect(spinner.inspireNow(S)!).rejects.toThrow('nothing usable')
  expect(spinner.museState().error).toContain('nothing usable')
  answer = () => Promise.reject(new Error('Model unavailable: a/b'))
  await expect(spinner.inspireNow(S)!).rejects.toThrow('Model unavailable')
  expect(spinner.muse().skits.length).toBe(0)
  expect(spinner.museState().isBusy).toBe(false)
})

test('the muse: a direct model is asked with its lightest reasoning variant, looked up once', async () => {
  const asked: { model: unknown }[] = []
  let lookups = 0
  const client = {
    model: { list: async () => (lookups++, { data: [{ providerID: 'x', id: 'thinker', variants: [{ id: 'high' }, { id: 'minimal' }, { id: 'low' }] }] }) },
    generate: { text: async (input: { prompt: string; model: unknown }) => (asked.push(input), reply(input.prompt)) },
  }
  const { spinner } = start({ model: 'x/thinker' }, {}, client)
  await spinner.inspireNow(S)
  await spinner.inspireNow(S)
  expect(asked.map(a => a.model)).toEqual([
    { providerID: 'x', id: 'thinker', variant: 'minimal' },
    { providerID: 'x', id: 'thinker', variant: 'minimal' },
  ])
  expect(lookups).toBe(1)
  expect(spinner.museState().via).toBe('x/thinker (minimal)')
})

test('several windows: only the one showing a session asks the muse and counts xp for it', async () => {
  const asked: string[] = []
  const client = { generate: { text: async (input: { prompt: string }) => (asked.push(input.prompt), reply(input.prompt)) } }
  // This window shows another session; ses_a runs in a different window.
  const away = start({ model: 'anthropic/claude-haiku-4-5' }, {}, client, { route: 'ses_other' })
  away.emit('session.execution.started', { sessionID: S })
  away.emit('session.execution.succeeded', { sessionID: S })
  await Bun.sleep(0)
  expect(asked.length).toBe(0)
  expect(away.spinner.pet.xp).toBe(0)
  // Its pet and finale still follow the session.
  expect(away.spinner.run(S).finale?.kind).toBe('answer')
  away.spinner.dispose()
  // Shown as a tab, or open now: this window asks, and counts.
  for (const shown of [{ route: 'ses_other', tabs: [S] }, { route: S }]) {
    const here = start({ model: 'anthropic/claude-haiku-4-5' }, {}, client, shown)
    const before = asked.length
    here.emit('session.execution.started', { sessionID: S })
    await Bun.sleep(0)
    expect(asked.length).toBe(before + 1)
    here.emit('session.execution.succeeded', { sessionID: S })
    expect(here.spinner.pet.xp).toBe(1)
    // The first skit kept is the next episode.
    expect(here.spinner.muse().skits[0]!.episode).toBe(1)
    here.spinner.dispose()
  }
})

test('the muse: an empty reply is asked again once; empty twice says so', async () => {
  let calls = 0
  const flaky = (empties: number) => ({ generate: { text: async (input: { prompt: string }) => (calls++ < empties ? { text: '  ' } : reply(input.prompt)) } })
  const once = start({ model: 'anthropic/claude-haiku-4-5' }, {}, flaky(1))
  await once.spinner.inspireNow(S)
  expect(calls).toBe(2)
  expect(once.spinner.muse().skits.length).toBe(2)
  once.spinner.dispose()
  calls = 0
  const twice = start({ model: 'anthropic/claude-haiku-4-5' }, {}, flaky(2))
  await expect(twice.spinner.inspireNow(S)!).rejects.toThrow('empty reply, twice')
  expect(calls).toBe(2)
})

test('the palette switches the language between Chinese and English, and keeps it', () => {
  const { spinner } = start({ language: 'en' })
  expect(spinner.toggleLanguage()).toBe('zh-Hans')
  expect(spinner.prefs.language).toBe('zh-Hans')
  expect(spinner.dockOf(S)!.bubble).toBe('我在这儿陪你～')
  expect(spinner.toggleLanguage()).toBe('en')
  expect(spinner.dockOf(S)!.bubble).toBe('I’m here with you~')
  setLang('en')
})

test('a subagent session that sends events before it is synced is not taken for a root', async () => {
  const asked: string[] = []
  const client = { generate: { text: async (input: { prompt: string }) => (asked.push(input.prompt), reply(input.prompt)) } }
  const CHILD = 'ses_child'
  const roots: Record<string, string> = {}
  const known = new Set([S])
  const { spinner, emit } = start({ model: 'anthropic/claude-haiku-4-5' }, roots, client, { route: S }, known)
  emit('session.execution.started', { sessionID: S })
  await Bun.sleep(0)
  emit('session.tool.input.started', { sessionID: S, id: 't1', name: 'task' })
  // The subagent starts: this window has not synced its session yet, so it looks like a root.
  emit('session.execution.started', { sessionID: CHILD })
  expect(spinner.run(CHILD).isTurn).toBe(false)
  // Synced: now it has a parent, and its end is ignored like the rest of its events.
  known.add(CHILD)
  roots[CHILD] = S
  emit('session.execution.succeeded', { sessionID: CHILD })
  await Bun.sleep(0)
  expect(asked.length).toBe(1)
  // The root's turn plays on through the subagent's run.
  expect(spinner.run(S).isTurn).toBe(true)
  expect(spinner.stateOf(S)).toBe('tool')
})

test('a subagent sent to the background keeps the pet busy after the turn ends', () => {
  const roots: Record<string, string> = { ses_child: S }
  const running = new Set<string>()
  const { spinner, emit } = start({}, roots, undefined, undefined, undefined, running)
  emit('session.execution.started', { sessionID: S })
  running.add('ses_child')
  // ctrl+b: the root's turn ends while the subagent works on.
  emit('session.execution.succeeded', { sessionID: S })
  expect(spinner.run(S).isTurn).toBe(false)
  expect(spinner.subagentsOf(S)).toBe(1)
  expect(spinner.stateOf(S)).toBe('tool')
  expect(spinner.toolOf(S)).toBe('subagent')
  expect(spinner.dockOf(S)!.bubble).toBe('subagent')
  roots.ses_two = S
  running.add('ses_two')
  expect(spinner.toolOf(S)).toBe('subagent ×2')
  // Done: back to how the turn ended.
  running.clear()
  expect(spinner.stateOf(S)).toBe('ready')
})
