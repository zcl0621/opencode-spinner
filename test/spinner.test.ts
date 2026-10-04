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

setLang('en')

type Handler = (event: { type: string; data: unknown }) => void

function fake(options: Record<string, unknown> = {}, roots: Record<string, string> = {}) {
  const handlers = new Map<string, Set<Handler>>()
  const toasts: string[] = []
  const storage = <T extends object>(initial: T) => {
    const [value, set] = createStore<T>(structuredClone(initial))
    return [value, (fn: (draft: T) => void) => set(produce(fn))] as const
  }
  const context = {
    options,
    data: {
      on(type: string, handler: Handler) {
        if (!handlers.has(type)) handlers.set(type, new Set())
        handlers.get(type)!.add(handler)
        return () => handlers.get(type)!.delete(handler)
      },
      session: { root: (sid: string) => roots[sid] ?? sid },
    },
    storage: {
      store: (_key: string, o: { initial: object }) => storage(o.initial),
      memory: (_key: string, o: { initial: object }) => storage(o.initial),
    },
    ui: { toast: { show: (o: { message: string }) => toasts.push(o.message) } },
  } as unknown as Plugin.Context
  const spinner = createSpinner(context, readConfig(options))
  const emit = (type: string, data: unknown) => handlers.get(type)?.forEach(h => h({ type, data }))
  return { spinner, emit, toasts }
}

let current: Spinner | undefined
afterEach(() => current?.dispose())

function start(options?: Record<string, unknown>, roots?: Record<string, string>) {
  const f = fake(options, roots)
  current = f.spinner
  return f
}

const S = 'ses_a'

test('a turn: thinking, a tool with its label, saying, then the finale and xp', () => {
  const { spinner, emit } = start({ theme: 'clawd' })
  expect(spinner.theme()).toBe('clawd')
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
  const { spinner, emit } = start({ theme: 'clawd' })
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
  const { spinner, emit } = start({ theme: 'clawd' }, { [child]: S })
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
  const { spinner, emit } = start({ theme: 'clawd' })
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
  const { spinner, emit, toasts } = start({ theme: 'clawd' })
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
  const { spinner, emit, toasts } = start({ theme: 'nyan' })
  for (let i = 0; i < 2; i++) {
    emit('session.execution.started', { sessionID: S })
    emit('session.execution.succeeded', { sessionID: S })
  }
  expect(spinner.pet.xp).toBe(2)
  expect(toasts).toEqual(['nyan reached Lv.2!'])
  const before = spinner.dockOf(S)!.id
  expect(spinner.patPet()).toBe(1)
  expect(spinner.pet.love).toBe(1)
  expect(spinner.dockOf(S)!.id).not.toBe(before)
  expect(spinner.dockOf(S)!.stats).toBe('Lv.2 ♥1')
})

test('switches and themes: off hides the pet, random keeps its draw, a choice is kept', () => {
  const { spinner } = start()
  const drawnAtRandom = spinner.theme()
  expect(spinner.choice()).toBe('random')
  expect(drawnAtRandom).not.toBe('audio')
  spinner.setSwitch('visible', false)
  expect(spinner.dockOf(S)).toBe(null)
  spinner.setSwitch('visible', true)
  spinner.setSwitch('companion', false)
  expect(spinner.dockOf(S)).toBe(null)
  spinner.setSwitch('companion', true)
  expect(spinner.dockOf(S)).not.toBe(null)
  expect(spinner.setChoice('dino')).toBe('dino')
  expect(spinner.prefs.theme).toBe('dino')
  expect(spinner.theme()).toBe('dino')
})

test('the theme follows its option (an effect, so Solid must be reactive here)', () => {
  const { spinner } = start({ theme: 'dino' })
  expect(spinner.theme()).toBe('dino')
})

test('reduced motion: every pet loop is one still frame', () => {
  const { spinner } = start({ theme: 'clawd', reducedMotion: true })
  expect(spinner.dockOf(S)!.order).toEqual([0])
})

test('a malformed event is ignored, not thrown', () => {
  const { spinner, emit } = start({ theme: 'clawd' })
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
    const { spinner, emit } = start({ theme: 'clawd' })
    emit('session.execution.started', { sessionID: S })
    emit('session.execution.succeeded', { sessionID: S })
    expect(spinner.run(S).finale).not.toBe(null)
    jest.advanceTimersByTime(3001)
    expect(spinner.run(S).finale).toBe(null)
    expect(spinner.stateOf(S)).toBe('ready')
    jest.advanceTimersByTime(5 * 60_000)
    expect(spinner.stateOf(S)).toBe('sleep')
    expect(spinner.dockOf(S)!.bubble).toBe('Zzz…')
    // A pat wakes it.
    spinner.patPet()
    expect(spinner.stateOf(S)).toBe('hello')
    // A preview runs eight seconds.
    spinner.showPreview('neon')
    expect(spinner.preview()?.theme).toBe('neon')
    jest.advanceTimersByTime(8001)
    expect(spinner.preview()).toBe(null)
  } finally {
    jest.useRealTimers()
  }
})
