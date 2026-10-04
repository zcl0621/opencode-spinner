// The pure parts: the show (bench and skatepark), the finale, the pet's
// frames, the sound seed, the muse, the labels and `/spinner`'s arguments.
import { expect, test } from 'bun:test'

import { AUDIO_BANDS, SoundSeed, lineSplitter, parseTapLine, seedFrom } from '../src/audio'
import { VIGNETTES, benchScene, museVignette, poolOf, toolKind, vignetteAt } from '../src/clawd'
import { RUN_LENGTH, SKATE_ROWS, obstacleAt, skateScene } from '../src/skate'
import { MUSE_LOW, lightestVariant, PROP_H, PROP_W, activityOf, clawdPrompt, jsonOf, museNeed, parseModel, parseTricks, parseVignettes, seedLine, skatePrompt } from '../src/muse'
import type { Muse } from '../src/muse'
import { SHOW_ROWS, showScene, stretchAt } from '../src/show'
import { parseCommand } from '../src/command'
import { readConfig } from '../src/config'
import { parseLanguage, resolveLanguage } from '../src/lang'
import { busyLabel, formatDuration, levelOf, newsOf, toolLabel } from '../src/pet'
import { CLAWD_PET, PET_ROWS, PET_W, dockPetOf } from '../src/pets'
import { THEME, finaleScene, segments, textWidth } from '../src/themes'
import type { Act } from '../src/themes'

const widthOf = (row: Parameters<typeof segments>[0]) => textWidth(segments(row).map(s => s.text).join(''))

test('the show and the finale fill exactly their width and rows, every frame', () => {
  const acts: Act[] = ['think', 'tool', 'ask', 'say', 'wait']
  const tools = [undefined, 'shell: npm test', 'grep: TODO', 'subagent ×3']
  expect(THEME.rows).toBe(SHOW_ROWS)
  for (const w of [16, 37, 80, 160]) {
    for (const seed of [0, 1, 4242, 4_294_967_295]) {
      for (let t = 0; t < 1500; t += 11) {
        const scene = THEME.scene(t, w, acts[t % acts.length]!, tools[t % tools.length], undefined, seed)
        expect(scene).toHaveLength(SHOW_ROWS)
        for (const row of [...scene, ...finaleScene('answer', '完成 · 12s', t, w), ...finaleScene('error', 'x', t, w)]) expect(widthOf(row)).toBe(w)
      }
    }
  }
  for (const frames of Object.values(THEME.sprite)) expect(frames.length).toBeGreaterThan(0)
})

test('the show: bench visits and skate runs take turns, in an order the seed picks', () => {
  const kinds = (seed: number) => {
    const out: string[] = []
    let last = -1
    for (let t = 0; t < 20_000; t += 5) {
      const s = stretchAt(t, 80, seed)
      if (s.salt !== last) out.push(s.kind)
      last = s.salt
    }
    return out
  }
  const a = kinds(1)
  expect(a.length).toBeGreaterThan(40)
  expect(a.filter(k => k === 'skate').length).toBeGreaterThan(5)
  expect(a.filter(k => k === 'bench').length).toBeGreaterThan(5)
  expect(kinds(2).join()).not.toBe(a.join())
  expect(kinds(1).join()).toBe(a.join())
  // A skate stretch is one run, from a drop-in deck: its tick 0 shows the drop-in.
  for (let seed = 0; seed < 50; seed++) {
    const s = stretchAt(0, 80, seed)
    if (s.kind === 'skate') expect(s.local).toBe(0)
  }
  expect(RUN_LENGTH).toBeGreaterThan(100)
  // An ask always shows him at the bench, sign up, even in a run.
  for (let seed = 0; seed < 30; seed++) {
    const g = showScene(10, 80, 'ask', undefined, undefined, seed)
    expect(g.map(r => r.map(c => c.ch).join('')).join('\n')).not.toContain('SCORE')
  }
})

test('the sound seed: tap lines stir it while something plays; quiet falls back to crypto', () => {
  expect(parseTapLine('L 40 1 2 3')).toEqual({ loud: 40, bands: [1, 2, 3] })
  expect(parseTapLine('E tap')).toBe(null)
  expect(parseTapLine('L 4 x')).toBe(null)
  const split = lineSplitter()
  expect(split('L 1 2\nL 3')).toEqual(['L 1 2'])
  expect(split(' 4\n')).toEqual(['L 3 4'])

  const line = (loud: number, level: number) => `L ${loud} ${new Array(AUDIO_BANDS).fill(level).join(' ')}`
  const sound = new SoundSeed()
  expect(sound.seed()).toBeNull()
  expect(sound.isAudible).toBe(false)
  sound.push(line(60, 50))
  const first = sound.seed()
  expect(first).not.toBeNull()
  expect(seedFrom(sound)).toEqual({ seed: first!, from: 'sound' })
  sound.push(line(61, 49))
  expect(sound.seed()).not.toBe(first)
  // The same sound, the same seed.
  const twin = new SoundSeed()
  twin.push(line(60, 50))
  expect(twin.seed()).toBe(first)
  for (let i = 0; i < 60; i++) sound.push(line(0, 0))
  expect(sound.isAudible).toBe(false)
  expect(sound.seed()).toBeNull()
  const quiet = seedFrom(sound)
  expect(quiet.from).toBe('random')
  expect(seedFrom(null).from).toBe('random')
  expect(new Set(Array.from({ length: 20 }, () => seedFrom(null).seed)).size).toBeGreaterThan(15)
})

test('the pet: every state loops in frames PET_W wide and PET_ROWS tall; still is one frame', () => {
  const view = { id: 'x', bubble: '', tone: 'plain' as const, stats: 'Lv.1 ♥0' }
  for (const state of ['think', 'tool', 'ask', 'say', 'wait', 'hello', 'ready', 'aborted', 'error', 'sleep'] as const) {
    const pet = dockPetOf(CLAWD_PET, state, view, state === 'ready')
    expect(pet.width).toBe(PET_W)
    expect(pet.order.length).toBeGreaterThan(0)
    for (const frame of pet.frames) {
      expect(frame).toHaveLength(PET_ROWS)
      for (const row of frame) expect(textWidth(row.map(s => s.text).join(''))).toBe(PET_W)
    }
    expect(dockPetOf(CLAWD_PET, state, view, false, true).order).toEqual([0])
  }
})

test('helpers', () => {
  expect(formatDuration(12_400)).toBe('12s')
  expect(formatDuration(185_000)).toBe('3m 05s')
  expect(formatDuration(3_720_000)).toBe('1h 02m')
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

test('/spinner arguments: status and pet', () => {
  expect(parseCommand('')).toEqual({ kind: 'status' })
  expect(parseCommand(' Status ')).toEqual({ kind: 'status' })
  expect(parseCommand('pet')).toEqual({ kind: 'pat' })
  expect(parseCommand('dino')).toEqual({ kind: 'unknown', name: 'dino' })
})

test('options and language', () => {
  expect(readConfig({})).toEqual({
    isVisible: true,
    hasFooterButton: true,
    hasStage: true,
    hasFinale: true,
    hasCompanion: true,
    isStill: false,
    language: 'auto',
    model: 'session',
    hasSoundSeed: true,
  })
  expect(readConfig({ model: ' anthropic/claude-haiku-4-5 ' }).model).toBe('anthropic/claude-haiku-4-5')
  expect(readConfig({ model: false }).model).toBeNull()
  expect(readConfig({ model: 'off' }).model).toBeNull()
  expect(readConfig({ sound: false }).hasSoundSeed).toBe(false)
  const set = readConfig({ visible: false, reducedMotion: true, celebrate: false, language: 'ja' })
  expect([set.isVisible, set.isStill, set.hasFinale, set.language]).toEqual([false, true, false, 'ja'])
  expect(readConfig({ visible: 'yes' }).isVisible).toBe(true)
  expect(parseLanguage('zh_TW.UTF-8')).toBe('zh-Hant')
  expect(parseLanguage('简体中文')).toBe('zh-Hans')
  expect(resolveLanguage('auto', undefined, [undefined, undefined, 'de_DE.UTF-8'])).toBe('de')
  expect(resolveLanguage('fr', undefined, ['zh_CN.UTF-8'])).toBe('fr')
  expect(resolveLanguage('auto', undefined, [])).toBe('en')
})

test('clawd: every vignette, walk and tool fills the width, every frame', () => {
  const tools = [undefined, 'shell: npm test', 'grep: TODO', 'edit: a.ts', 'webfetch: x.dev', 'subagent ×3', 'mystery']
  const acts: Act[] = ['think', 'tool', 'ask', 'say', 'wait']
  for (const w of [16, 30, 47, 80, 160]) {
    for (let t = 0; t < 1200; t += 3) {
      const scene = benchScene(t, w, acts[t % acts.length]!, tools[t % tools.length], undefined, t % 5)
      expect(scene).toHaveLength(4)
      for (const row of scene) expect(widthOf(row)).toBe(w)
    }
  }
})

test('clawd: tools pick fitting vignettes, and over many laps he does many things', () => {
  expect(toolKind('shell: npm test')).toBe('shell')
  expect(toolKind('grep: TODO')).toBe('search')
  expect(toolKind('read')).toBe('search')
  expect(toolKind('websearch: bun')).toBe('web')
  expect(toolKind('edit: a.ts')).toBe('edit')
  expect(toolKind('subagent ×3')).toBe('agent')
  expect(toolKind(undefined)).toBe('other')
  for (const act of ['think', 'tool', 'ask', 'say', 'wait'] as const) expect(poolOf(act).length).toBeGreaterThan(0)
  expect(poolOf('tool', 'grep: x').map(v => v.name)).toContain('search')
  expect(poolOf('ask').map(v => v.name)).toEqual(['sign'])

  const seen = (act: Act, tool?: string) => {
    const names = new Set<string>()
    for (let t = 0; t < 40_000; t += 7) {
      const now = vignetteAt(t, 80, act, tool)
      if (now) names.add(now.vignette.name)
    }
    return names
  }
  expect(seen('tool').size).toBe(poolOf('tool').length)
  expect(seen('tool', 'shell: make')).toEqual(new Set(poolOf('tool', 'shell: make').map(v => v.name)))
  expect(seen('think').size).toBe(poolOf('think').length)
  expect(seen('say').size).toBe(poolOf('say').length)
  // Every vignette appears in some pool.
  const pooled = new Set(
    (['think', 'say', 'ask', 'wait'] as const)
      .flatMap(act => poolOf(act))
      .concat(['search', 'web', 'edit', 'shell', 'agent', 'other'].flatMap(k => poolOf('tool', k === 'other' ? undefined : `${k === 'search' ? 'grep' : k === 'web' ? 'webfetch' : k === 'agent' ? 'subagent' : k}: x`)))
      .map(v => v.name),
  )
  expect([...pooled].sort()).toEqual(VIGNETTES.map(v => v.name).sort())
})

test('clawd: a turn (tick 0) opens with him at work, for any width with room', () => {
  for (const w of [30, 47, 80, 120, 200]) {
    for (const act of ['think', 'tool', 'say', 'ask'] as const) expect(vignetteAt(0, w, act)).not.toBe(null)
  }
})

test('skate: every frame fills the width and its rows, at any width', () => {
  for (const w of [12, 30, 61, 120]) {
    for (const act of ['think', 'tool', 'ask', 'say'] as Act[]) {
      for (let t = 0; t < 600; t += 3) {
        const g = skateScene(t, w, act)
        expect(g.length).toBe(SKATE_ROWS)
        for (const row of g) expect(widthOf(row)).toBe(w)
      }
    }
  }
})

test('skate: the park has every obstacle, he throws many tricks, and sometimes bails', () => {
  const kinds = new Set<string>()
  for (let i = 0; i < 200; i++) kinds.add(obstacleAt(i, 'tool').kind)
  expect([...kinds].sort()).toEqual(['drop', 'handrail', 'kicker', 'manual', 'pyramid', 'rail', 'stairs'])
  const labels = new Set<string>()
  for (let t = 0; t < 20_000; t += 2) {
    const top = skateScene(t, 100, 'tool')[0]!.map(c => c.ch).join('')
    const m = top.match(/([A-Z0-9][A-Z0-9 -]*?) \+\d+|BAIL!/)
    if (m) labels.add(m[1] ?? 'BAIL!')
  }
  for (const trick of ['KICKFLIP', '360 FLIP', 'HEELFLIP', 'POP SHOVE-IT', 'DROP IN', 'MANUAL', 'BAIL!']) expect(labels).toContain(trick)
  expect([...labels].filter(l => /GRIND|SLIDE|5-0|50-50/.test(l)).length).toBeGreaterThan(3)
  expect(labels.size).toBeGreaterThan(15)
})

test('muse: model ids, prompts, and replies read strictly', () => {
  expect(parseModel('anthropic/claude-haiku-4-5')).toEqual({ providerID: 'anthropic', id: 'claude-haiku-4-5' })
  expect(parseModel('openrouter/qwen/qwen3-8b')).toEqual({ providerID: 'openrouter', id: 'qwen/qwen3-8b' })
  expect(parseModel('session')).toBe('session')
  expect(lightestVariant(['low', 'high', 'max'])).toBe('low')
  expect(lightestVariant(['minimal', 'low', 'medium'])).toBe('minimal')
  expect(lightestVariant(['high', 'max'])).toBeUndefined()
  expect(lightestVariant([])).toBeUndefined()
  expect(skatePrompt('thinking', 1)).toContain('no long thinking')
  for (const off of ['off', '', 'nope', '/x', 'x/', null, 3]) expect(parseModel(off)).toBeNull()
  expect(activityOf('tool', 'shell: bun test')).toContain('shell: bun test')
  expect(skatePrompt('thinking', 7)).toContain('"tricks"')
  expect(skatePrompt('thinking', 7)).toContain('Random seed 7')
  expect(seedLine(1)).not.toBe(seedLine(2))
  expect(clawdPrompt('thinking', 'zh-Hans', 7)).toContain('Simplified Chinese')
  expect(jsonOf('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(jsonOf('no json here')).toBeNull()

  const tricks = parseTricks(JSON.stringify({
    tricks: [
      { name: 'Git Push Grind', kind: 'grind', frames: ['tail'], points: 777 },
      { name: 'Null Pointer Flip', kind: 'flip', frames: ['grip', 'under', 'bogus'], points: 99999 },
      { name: 'Way too long a trick name to show at all', kind: 'grab', frames: [], points: 'x' },
      { name: 'Short', kind: 'flip', frames: [] },
      { name: '', kind: 'flip', frames: ['flat'] },
      { name: 'Bad kind', kind: 'teleport', frames: ['flat'] },
      { name: 'Lazy manual', kind: 'manual', frames: ['grip'] },
    ],
  }))
  expect(tricks.map(t => t.name)).toEqual(['Git Push Grind', 'Null Pointer Flip', 'Way too long a trick na', 'Lazy manual'].map(n => n.slice(0, 22).trim()))
  expect(tricks[0]).toEqual({ name: 'Git Push Grind', kind: 'grind', frames: ['tail'], points: 800 })
  expect(tricks[1]!.frames).toEqual(['flat', 'grip', 'under', 'flat'])
  expect(tricks[1]!.points).toBe(2000)
  expect(tricks[2]!.frames).toEqual(['flat'])
  expect(tricks[3]!.frames).toEqual(['flat'])

  const vignettes = parseVignettes(JSON.stringify({
    vignettes: [
      { caption: 'Brewing coffee for the build', pose: 'work', colors: { A: '#7aa2f7', B: '#e0af68', c: '#ffffff', D: 'red' }, frames: [['..AAAA..', '..AXXA..', 'BBBBBBBBBBBBBBBBBB', 'B', 'B', 'B', 'B'], ['....']] },
      { caption: 'No colors', colors: {}, frames: [['AAAA']] },
      { caption: 'No pixels', colors: { A: '#ffffff' }, frames: [['....']] },
    ],
  }))
  expect(vignettes.length).toBe(1)
  const v = vignettes[0]!
  expect(v.caption.length).toBeLessThanOrEqual(20)
  expect(Object.keys(v.colors)).toEqual(['A', 'B', 'C'])
  expect(v.frames.length).toBe(1)
  expect(v.frames[0]!.length).toBe(PROP_H)
  expect(v.frames[0]![1]).toBe('..A..A..')
  for (const row of v.frames[0]!) expect(row.length).toBeLessThanOrEqual(PROP_W)
  expect(museVignette(v)).toBe(museVignette(v))
})

test('muse: skate and clawd draw what it wrote, every frame the full width', () => {
  const muse: Muse = {
    tricks: parseTricks(JSON.stringify({ tricks: [
      { name: 'Git Push Grind', kind: 'grind', frames: ['tail'], points: 700 },
      { name: 'Null Pointer Flip', kind: 'flip', frames: ['flat', 'grip', 'under', 'graphic', 'flat'], points: 900 },
      { name: 'Merge Manual', kind: 'manual', frames: ['nose'], points: 300 },
    ] })),
    vignettes: parseVignettes(JSON.stringify({ vignettes: [
      { caption: 'Brewing a build', pose: 'work', colors: { A: '#7aa2f7', B: '#e0af68' }, frames: [['.AAAA.', '.A..A.', 'BBBBBB'], ['.AAAA.', '.AAAA.', 'BBBBBB']] },
    ] })),
  }
  const labels = new Set<string>()
  for (let t = 0; t < 8000; t += 2) {
    const g = skateScene(t, 90, 'tool', muse)
    for (const row of g) expect(widthOf(row)).toBe(90)
    labels.add(g[0]!.map(c => c.ch).join(''))
  }
  const seen = [...labels].join('\n')
  for (const name of ['GIT PUSH GRIND', 'NULL POINTER FLIP', 'MERGE MANUAL']) expect(seen).toContain(name)
  let captions = 0
  for (let t = 0; t < 4000; t += 2) {
    const g = benchScene(t, 70, 'tool', 'shell: bun test', muse)
    for (const row of g) expect(widthOf(row)).toBe(70)
    if (g[0]!.map(c => c.ch).join('').includes('Brewing a build')) captions++
  }
  expect(captions).toBeGreaterThan(50)
  // An ask keeps its sign.
  for (let t = 0; t < 2000; t += 5) expect(benchScene(t, 70, 'ask', undefined, muse)[0]!.map(c => c.ch).join('')).not.toContain('Brewing')
})

test('muse: copies of the format example are dropped; the seed decides when to ask', () => {
  const copy = JSON.stringify({ vignettes: [
    { caption: '<caption>', colors: { A: '#7aa2f7', B: '#e0af68' }, frames: [['..AAAA..', '..A..A..', 'BBBBBBBB'], ['..AAAA..', '..AAAA..', 'BBBBBBBB']] },
    { caption: 'Copied', colors: { A: '#7aa2f7', B: '#e0af68' }, frames: [['..AAAA..', '..A..A..', 'BBBBBBBB']] },
  ] })
  expect(parseVignettes(copy)).toEqual([])
  // Lenient on form, strict on content: #rgb and #rrggbbaa, lowercase keys, a frame as one string.
  const loose = parseVignettes(JSON.stringify({ vignettes: [{ caption: 'Loose', colors: { a: '#f80', B: '#11223344', C: 'red' }, frames: ['aaa.|.BB.|cccc', ['AaA', 'b.b']] }] }))
  expect(loose).toEqual([{ caption: 'Loose', pose: 'work', colors: { A: '#ff8800', B: '#112233' }, frames: [['AAA.', '.BB.', '....'], ['AAA', 'B.B']] }])
  expect(parseTricks(JSON.stringify({ tricks: [{ name: '<trick name>', kind: 'flip', frames: ['flat', 'grip', 'flat'] }] }))).toEqual([])

  const trick = { name: 'x', kind: 'grab' as const, frames: ['flat' as const], points: 100 }
  const scene = { caption: 'x', pose: 'work' as const, frames: [['AAA']], colors: { A: '#ffffff' } }
  const empty: Muse = { tricks: [], vignettes: [] }
  expect(museNeed(empty, 1)).toBe('tricks')
  expect(museNeed(empty, 2)).toBe('vignettes')
  expect(museNeed({ tricks: [trick], vignettes: [] }, 1)).toBe('vignettes')
  const full: Muse = { tricks: new Array(MUSE_LOW).fill(trick), vignettes: new Array(MUSE_LOW).fill(scene) }
  let asks = 0
  for (let seed = 0; seed < 100 * 256; seed += 256) if (museNeed(full, seed)) asks++
  expect(asks).toBeGreaterThan(20)
  expect(asks).toBeLessThan(50)
})
