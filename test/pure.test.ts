// The pure parts: scenes, finales, the pet's frames, the audio meter, the
// labels and `/spinner`'s arguments. Ported from hoobnn's spinner tests.
import { expect, test } from 'bun:test'

import { AUDIO_BANDS, AudioMeter, lineSplitter, parseTapLine } from '../src/audio'
import { parseCommand } from '../src/command'
import { readConfig } from '../src/config'
import { parseLanguage, resolveLanguage } from '../src/lang'
import { busyLabel, formatDuration, levelOf, newsOf, toolLabel } from '../src/pet'
import { PET_ROWS, PET_W, dockPetOf, petArtOf } from '../src/pets'
import { THEMES, THEME_NAMES, finaleScene, petRow, pickRandom, segments, textWidth } from '../src/themes'
import type { Act } from '../src/themes'

const widthOf = (row: Parameters<typeof segments>[0]) => textWidth(segments(row).map(s => s.text).join(''))

test('every scene, finale and companion row fills exactly its width, every frame', () => {
  const acts: Act[] = ['think', 'tool', 'ask', 'say']
  for (const name of THEME_NAMES) {
    const theme = THEMES[name]
    for (const w of [16, 37, 80, 160]) {
      for (let t = 0; t < 150; t += 7) {
        const scene = theme.scene(t, w, acts[t % 4]!)
        expect(scene).toHaveLength(theme.rows)
        const rows = [
          ...scene,
          ...finaleScene(theme, 'answer', '完成 · 12s', t, w),
          ...finaleScene(theme, 'error', 'x', t, w),
          ...petRow(theme, { state: acts[t % 4]!, bubble: t % 2 ? 'shell: npm test' : '', stats: 'Lv.3 ♥12' }, t, w, t % 3),
          ...petRow(theme, { state: 'sleep', bubble: 'Zzz…', stats: 'Lv.1 ♥0' }, t, w, 0),
        ]
        for (const row of rows) expect(widthOf(row)).toBe(w)
      }
    }
    for (const frames of Object.values(theme.sprite)) expect(frames.length).toBeGreaterThan(0)
  }
})

test('the audio scene fills its width with live levels, silence, no tap and a made-up signal', () => {
  const theme = THEMES.audio
  const loud = { b: Array.from({ length: AUDIO_BANDS }, (_, i) => (i * 37) % 100), p: new Array(AUDIO_BANDS).fill(99), beat: 3 }
  const quiet = { b: new Array(AUDIO_BANDS).fill(0), p: new Array(AUDIO_BANDS).fill(0), beat: 0 }
  for (const feed of [loud, quiet, null, undefined]) {
    for (const w of [16, 31, 32, 80, 160]) {
      for (let t = 0; t < 40; t += 3) {
        const scene = theme.scene(t, w, 'tool', feed)
        expect(scene).toHaveLength(theme.rows)
        for (const row of scene) expect(widthOf(row)).toBe(w)
      }
    }
  }
  const text = (feed: Parameters<typeof theme.scene>[3]) =>
    theme
      .scene(0, 80, 'think', feed)
      .map(row => segments(row).map(s => s.text).join(''))
      .join('\n')
  expect(text(loud)).toContain('█')
  expect(text(loud)).toContain('┗(・o・)┓')
  expect(text(quiet)).not.toContain('█')
  expect(text(null)).toContain('zZ')
})

test('the audio meter: tap lines to gained levels, falling peaks, beats and silence', () => {
  expect(parseTapLine('L 40 1 2 3')).toEqual({ loud: 40, bands: [1, 2, 3] })
  expect(parseTapLine('E tap')).toBe(null)
  expect(parseTapLine('L 4 x')).toBe(null)
  const split = lineSplitter()
  expect(split('L 1 2\nL 3')).toEqual(['L 1 2'])
  expect(split(' 4\n')).toEqual(['L 3 4'])

  const meter = new AudioMeter()
  expect(meter.isAudible).toBe(false)
  const line = (loud: number, level: number) => `L ${loud} ${new Array(AUDIO_BANDS).fill(level).join(' ')}`
  meter.push(line(5, 0))
  meter.push(line(60, 50))
  expect(meter.view().b[0]).toBe(99)
  expect(meter.view().beat).toBe(1)
  expect(meter.isAudible).toBe(true)
  meter.push(line(60, 0))
  expect(meter.view().b[0]).toBe(0)
  expect(meter.view().p[0]).toBe(95)
  for (let i = 0; i < 60; i++) meter.push(line(0, 0))
  expect(meter.isAudible).toBe(false)
})

test('the pet: every state loops in frames PET_W wide and PET_ROWS tall; still is one frame', () => {
  const view = { id: 'x', bubble: '', tone: 'plain' as const, stats: 'Lv.1 ♥0' }
  for (const name of THEME_NAMES) {
    const art = petArtOf(name, THEMES[name].color)
    for (const state of ['think', 'tool', 'ask', 'say', 'wait', 'hello', 'ready', 'aborted', 'error', 'sleep'] as const) {
      const pet = dockPetOf(art, state, view, state === 'ready')
      expect(pet.width).toBe(PET_W)
      expect(pet.order.length).toBeGreaterThan(0)
      for (const frame of pet.frames) {
        expect(frame).toHaveLength(PET_ROWS)
        for (const row of frame) expect(textWidth(row.map(s => s.text).join(''))).toBe(PET_W)
      }
      expect(dockPetOf(art, state, view, false, true).order).toEqual([0])
    }
  }
})

test('helpers', () => {
  expect(formatDuration(12_400)).toBe('12s')
  expect(formatDuration(185_000)).toBe('3m 05s')
  expect(formatDuration(3_720_000)).toBe('1h 02m')
  for (let i = 0; i < 50; i++) expect(THEME_NAMES).toContain(pickRandom(i))
  // The audio theme starts a process: chosen by name only.
  for (let i = 0; i < 200; i++) expect(pickRandom(i)).not.toBe('audio')
  expect([0, 1, 2, 8, 18].map(levelOf)).toEqual([1, 1, 2, 3, 4])
  // opencode's tools and their inputs.
  expect(toolLabel({ tool: 'shell', command: 'npm test\nnpm run lint' })).toBe('shell: npm test')
  expect(toolLabel({ tool: 'edit', path: '/a/b/themes.ts' })).toBe('edit: themes.ts')
  expect(toolLabel({ tool: 'grep', pattern: 'TODO' })).toBe('grep: TODO')
  expect(toolLabel({ tool: 'websearch', query: 'bun test' })).toBe('websearch: bun test')
  expect(toolLabel({ tool: 'webfetch', url: 'https://opencode.ai/docs' })).toBe('webfetch: opencode.ai/docs')
  expect(toolLabel({ tool: 'subagent', agent: 'explore', description: 'Study HUD mods', prompt: '…' })).toBe('subagent: Study HUD mods')
  expect(toolLabel({ tool: 'shell', command: 'x'.repeat(80) })).toHaveLength(32)
  expect(newsOf('npm test', false)).toBe('testPass')
  expect(newsOf('cd a && CI=1 pytest -q', true)).toBe('testFail')
  expect(newsOf('go test ./...', false)).toBe('testPass')
  expect(newsOf('git -C repo commit -m "x"', false)).toBe('commit')
  expect(newsOf('git commit -m x', true)).toBe(null)
  expect(newsOf('git commit --dry-run', false)).toBe(null)
  expect(newsOf('cat test.log', false)).toBe(null)
  expect(newsOf('npm run lint', false)).toBe(null)
  expect(busyLabel(['subagent: a', 'subagent: b', 'subagent: c'])).toBe('subagent ×3')
  expect(busyLabel(['read: a.ts', 'subagent: b'])).toBe('subagent: b')
  expect(busyLabel([])).toBe(undefined)
})

test('/spinner arguments', () => {
  expect(parseCommand('')).toEqual({ kind: 'status' })
  expect(parseCommand('status')).toEqual({ kind: 'status' })
  expect(parseCommand(' OFF ')).toEqual({ kind: 'visible', isOn: false })
  expect(parseCommand('stage on')).toEqual({ kind: 'stage', isOn: true })
  expect(parseCommand('stage')).toEqual({ kind: 'unknown', name: 'stage' })
  expect(parseCommand('companion off')).toEqual({ kind: 'companion', isOn: false })
  expect(parseCommand('pet')).toEqual({ kind: 'pat' })
  expect(parseCommand('preview')).toEqual({ kind: 'preview', theme: null })
  expect(parseCommand('preview neon')).toEqual({ kind: 'preview', theme: 'neon' })
  expect(parseCommand('preview x')).toEqual({ kind: 'unknown', name: 'x' })
  expect(parseCommand('Random')).toEqual({ kind: 'theme', theme: 'random' })
  expect(parseCommand('cat')).toEqual({ kind: 'theme', theme: 'cat' })
  expect(parseCommand('theme')).toEqual({ kind: 'pick' })
  expect(parseCommand('theme neon')).toEqual({ kind: 'theme', theme: 'neon' })
  expect(parseCommand('theme random')).toEqual({ kind: 'theme', theme: 'random' })
  expect(parseCommand('theme x')).toEqual({ kind: 'unknown', name: 'x' })
})

test('options and language', () => {
  expect(readConfig({})).toEqual({
    theme: 'random',
    isVisible: true,
    hasFooterButton: true,
    hasStage: true,
    hasFinale: true,
    hasCompanion: true,
    isStill: false,
    language: 'auto',
  })
  const set = readConfig({ theme: 'dino', visible: false, reducedMotion: true, celebrate: false, language: 'ja' })
  expect([set.theme, set.isVisible, set.isStill, set.hasFinale, set.language]).toEqual(['dino', false, true, false, 'ja'])
  expect(readConfig({ theme: 'nope', visible: 'yes' }).theme).toBe('random')
  expect(readConfig({ visible: 'yes' }).isVisible).toBe(true)
  expect(parseLanguage('zh_TW.UTF-8')).toBe('zh-Hant')
  expect(parseLanguage('简体中文')).toBe('zh-Hans')
  expect(resolveLanguage('auto', undefined, [undefined, undefined, 'de_DE.UTF-8'])).toBe('de')
  expect(resolveLanguage('fr', undefined, ['zh_CN.UTF-8'])).toBe('fr')
  expect(resolveLanguage('auto', undefined, [])).toBe('en')
})
