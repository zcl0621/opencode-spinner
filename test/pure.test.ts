// The pure parts: the show (the bench and the skits), the pixels, the finale,
// the pet's frames, the sound seed, the muse, the labels and `/spinner`'s arguments.
import { expect, test } from 'bun:test'

import { AUDIO_BANDS, SoundSeed, lineSplitter, parseTapLine, seedFrom } from '../src/audio'
import { canvas, cells, dot, octantBits, plot } from '../src/cells'
import { VIGNETTES, benchScene, poolOf, toolKind, vignetteAt } from '../src/clawd'
import { HAT_W, MUSE_LOW, PROP_H, PROP_W, jsonOf, kindOf, lightestVariant, museNeed, parseModel, parseSkits, seedLine, skitPrompt } from '../src/muse'
import type { Muse, MuseSkit } from '../src/muse'
import { SHOW_ROWS, nextStage, showScene, stretchAt } from '../src/show'
import { skitLength, skitScene } from '../src/stage'
import { parseCommand } from '../src/command'
import { pixelModeOf, readConfig } from '../src/config'
import { parseLanguage, resolveLanguage } from '../src/lang'
import { busyLabel, formatDuration, levelOf, newsOf, toolLabel } from '../src/pet'
import { CLAWD_PET, PET_ROWS, PET_W, dockPetOf } from '../src/pets'
import { THEME, finaleScene, segments, textWidth } from '../src/themes'
import type { Act } from '../src/themes'

/** A skit as a model might write it (hand-written here for the tests). */
const SKIT_REPLY = JSON.stringify({
  skits: [
    {
      title: 'Night fishing for bugs',
      place: { backdrop: 'sea', sky: 'moon', weather: 'stars', colors: { far: '#1f2a44', near: '#3d59a1', ground: '#6b5a48', accent: '#e0af68' } },
      look: { eyes: 'normal', colors: { A: '#e0af68', B: '#8c6a3f' }, hat: ['....BBBB....', '..BAAAAAAB..', 'BBBBBBBBBBBB'], held: [] },
      props: [
        { id: 'bucket', x: 0.75, motion: 'still', colors: { G: '#9aa5ce', D: '#565f89' }, frames: [['.DDDDDD.', 'DGGGGGGD', '.DGGGGD.', '..DDDD..']] },
        { id: 'Bug', x: 0.45, motion: 'float', colors: { K: '#9ece6a', E: '#1a1b26' }, frames: [['..KK..', '.KEEK.', 'KKKKKK'], ['K.KK.K', '.KEEK.', 'KKKKKK']] },
      ],
      beats: [
        { do: 'walk', to: 0.3, secs: 2, effect: 'none', say: '' },
        { do: 'look', prop: 'bug', secs: 2, effect: 'question', say: 'a bug?' },
        { do: 'carry', prop: 'bug', to: 0.7, secs: 3, effect: 'sparks', say: 'gotcha' },
        { do: 'throw', prop: 'bug', secs: 3, effect: 'none', say: '' },
        { do: 'push', prop: 'bucket', to: 0.1, secs: 3, effect: 'smoke', say: '' },
        { do: 'cheer', secs: 2, effect: 'confetti', say: 'fixed!' },
        { do: 'sleep', secs: 2, effect: 'none', say: '' },
      ],
    },
  ],
})
const SKITS = (kind: Parameters<typeof parseSkits>[1] = 'think') => parseSkits(SKIT_REPLY, kind)

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

test('the show: the bench, then skits for the work at hand, in an order the seed picks', () => {
  const lengths = [120, 80, 200]
  const order = (seed: number, ls: readonly number[]) => {
    const out: string[] = []
    let last = ''
    for (let t = 0; t < 20_000; t += 5) {
      const s = stretchAt(t, 80, seed, ls)
      const id = `${s.salt}`
      if (id !== last) out.push(s.skit === null ? 'bench' : `skit${s.skit}`)
      last = id
    }
    return out
  }
  const a = order(1, lengths)
  expect(a[0]).toMatch(/^skit/)
  expect(a.filter(k => k === 'bench').length).toBeGreaterThan(3)
  expect(new Set(a.filter(k => k !== 'bench')).size).toBe(3)
  expect(order(2, lengths).join()).not.toBe(a.join())
  expect(order(1, lengths).join()).toBe(a.join())
  // No skits: only the bench.
  expect(new Set(order(1, []))).toEqual(new Set(['bench']))

  // The stage holds to a kind of work a while, and takes new work only once it settles.
  const muse: Muse = { skits: [...SKITS('edit'), ...SKITS('think')] }
  let stage = nextStage(undefined, 'think', 0, muse)
  expect(stage).toEqual({ kind: 'think', since: 0, count: 1 })
  for (let t = 1; t < 40; t++) stage = nextStage(stage, t % 2 ? 'edit' : 'think', t, muse)
  expect(stage.kind).toBe('think')
  for (let t = 40; t < 120; t++) stage = nextStage(stage, 'edit', t, muse)
  expect(stage.kind).toBe('edit')
  expect(stage.since).toBeGreaterThanOrEqual(60)
  expect(nextStage(stage, null, 500, muse)).toEqual(stage)

  // A skit for the work comes on when it changes; an ask always shows the bench, sign up.
  const show = showScene(stage.since + 5, 80, 'tool', 'edit: a.ts', muse, 3, stage)
  expect(show.map(r => r.map(c => c.ch).join('')).join('')).toContain('Night fishing')
  for (let seed = 0; seed < 30; seed++) {
    const g = showScene(stage.since + 5, 80, 'ask', undefined, muse, seed, stage)
    expect(g.map(r => r.map(c => c.ch).join('')).join('')).not.toContain('Night fishing')
  }
})

test('pixels: fine ones in octants, two colors a cell; coarse ones in half blocks', () => {
  const cv = canvas(4, 1)
  dot(cv, 0, 0, '#ff0000')
  dot(cv, 1, 3, '#ff0000')
  plot(cv, 2, 0, '#00ff00')
  const fine = cells(cv, 'fine')[0]!
  expect(octantBits(fine[0]!.ch)).toBe(1 | 128)
  expect(fine[0]!.c).toBe('#ff0000')
  expect(fine[1]).toEqual({ ch: ' ' })
  expect(fine[2]).toEqual({ ch: '▀', c: '#00ff00' })
  // Every pattern has its own character.
  const chars = new Set<string>()
  for (let bits = 1; bits < 256; bits++) {
    const c = canvas(1, 1)
    for (let i = 0; i < 8; i++) if (bits & (1 << i)) dot(c, i % 2, Math.floor(i / 2), '#ffffff')
    const ch = cells(c, 'fine')[0]![0]!.ch
    expect(octantBits(ch)).toBe(bits)
    chars.add(ch)
  }
  expect(chars.size).toBe(255)
  // Three colors in a cell: the odd one out joins the nearer of the two kept.
  const three = canvas(1, 1)
  for (let i = 0; i < 4; i++) dot(three, i % 2, Math.floor(i / 2), '#ff0000')
  for (let i = 4; i < 7; i++) dot(three, i % 2, Math.floor(i / 2), '#0000ff')
  dot(three, 1, 3, '#ee0000')
  const mixed = cells(three, 'fine')[0]![0]!
  expect([octantBits(mixed.ch), mixed.c, mixed.bg]).toEqual([15 | 128, '#ff0000', '#0000ff'])
  // Coarse: whole pixels as before; a lone fine pixel still shows.
  expect(cells(cv, 'coarse')[0]!.map(c => c.ch).join('')).toBe('█ ▀ ')
  expect(pixelModeOf('auto', { TERM_PROGRAM: 'ghostty' })).toBe('fine')
  expect(pixelModeOf('auto', { TERM_PROGRAM: 'Apple_Terminal' })).toBe('coarse')
  expect(pixelModeOf('fine', {})).toBe('fine')
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
    pixels: 'auto',
  })
  expect(readConfig({ pixels: 'fine' }).pixels).toBe('fine')
  expect(readConfig({ pixels: 'huge' }).pixels).toBe('auto')
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
      const scene = benchScene(t, w, acts[t % acts.length]!, tools[t % tools.length], t % 5)
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

test('muse: model ids, prompts, and replies read strictly', () => {
  expect(parseModel('anthropic/claude-haiku-4-5')).toEqual({ providerID: 'anthropic', id: 'claude-haiku-4-5' })
  expect(parseModel('openrouter/qwen/qwen3-8b')).toEqual({ providerID: 'openrouter', id: 'qwen/qwen3-8b' })
  expect(parseModel('session')).toBe('session')
  for (const off of ['off', '', 'nope', '/x', 'x/', null, 3]) expect(parseModel(off)).toBeNull()
  expect(lightestVariant(['low', 'high', 'max'])).toBe('low')
  expect(lightestVariant(['minimal', 'low', 'medium'])).toBe('minimal')
  expect(lightestVariant(['high', 'max'])).toBeUndefined()
  expect(kindOf('tool', 'grep: TODO')).toBe('search')
  expect(kindOf('tool', 'subagent ×3')).toBe('agent')
  expect(kindOf('say')).toBe('say')
  expect(kindOf('think')).toBe('think')
  expect(kindOf('ask')).toBeNull()
  const prompt = skitPrompt('shell', 'shell: bun test', 'zh-Hans', 7)
  for (const part of ['no long thinking', 'running shell commands', 'shell: bun test', 'Random seed 7', 'Simplified Chinese', '"skits"']) expect(prompt).toContain(part)
  expect(seedLine(1)).not.toBe(seedLine(2))
  expect(jsonOf('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(jsonOf('no json here')).toBeNull()

  const [skit] = SKITS('think')
  expect(skit!.kind).toBe('think')
  expect(skit!.title).toBe('Night fishing for bugs')
  expect(skit!.place!.backdrop).toBe('sea')
  expect(skit!.look!.hat.length).toBe(3)
  expect(skit!.props.map(p => p.id)).toEqual(['bucket', 'bug'])
  expect(skit!.beats.map(b => b.do)).toEqual(['walk', 'look', 'carry', 'throw', 'push', 'cheer', 'sleep'])
  expect(skitLength(skit!)).toBe(170)

  // Strict on content, lenient on form.
  const odd = parseSkits(JSON.stringify({ skits: [
    {
      title: 'A title far too long to fit on the stage at all',
      place: { backdrop: 'volcano', colors: { far: '#123', near: '#456', ground: '#789', accent: '#abcdef80' } },
      look: { eyes: 'normal', hat: [], held: [] },
      props: [
        { id: 'x', frames: ['AAA|.B.', 'zzz'], colors: { a: '#ff0000', B: '#00ff00', C: 'red' }, x: 7, motion: 'teleport' },
        { id: 'x', frames: [['AAA']], colors: { A: '#ffffff' } },
        { id: 'empty', frames: [['...']], colors: { A: '#ffffff' } },
        { id: 'big', frames: [['A'.repeat(60), ...new Array(30).fill('A')]], colors: { A: '#ffffff' } },
      ],
      beats: [
        { do: 'carry', prop: 'ghost', secs: 99, effect: 'nuke', say: '<a line>' },
        { do: 'fly', secs: 2 },
        { do: 'throw', secs: 2, say: 'hi\nthere' },
        { do: 'wave', secs: 6 }, { do: 'wave', secs: 6 }, { do: 'wave', secs: 6 }, { do: 'wave', secs: 6 }, { do: 'wave', secs: 6 },
      ],
    },
    { title: 'One beat', beats: [{ do: 'wave', secs: 2 }] },
    { title: '<title>', beats: [{ do: 'wave' }, { do: 'jump' }] },
  ] }), 'edit')
  expect(odd.length).toBe(1)
  const o = odd[0]!
  expect(o.title.length).toBeLessThanOrEqual(24)
  expect(o.place).toEqual({ backdrop: 'none', sky: 'none', weather: 'clear', colors: { far: '#112233', near: '#445566', ground: '#778899', accent: '#abcdef' } })
  expect(o.look).toBeNull()
  expect(o.props.map(p => p.id)).toEqual(['x', 'big'])
  expect(o.props[0]).toEqual({ id: 'x', frames: [['AAA', '.B.']], colors: { A: '#ff0000', B: '#00ff00' }, x: 1, motion: 'still' })
  expect(o.props[1]!.frames[0]!.length).toBe(PROP_H)
  expect(o.props[1]!.frames[0]![0]!.length).toBe(PROP_W)
  expect(o.beats.map(b => b.do)).toEqual(['walk', 'stand', 'wave', 'wave', 'wave'])
  expect(o.beats[0]).toEqual({ do: 'walk', to: null, prop: null, effect: 'none', say: '', secs: 6 })
  expect(o.beats[1]!.say).toBe('hi there')
  expect(o.beats.reduce((n, b) => n + b.secs, 0)).toBeLessThanOrEqual(30)
  expect(HAT_W).toBe(28)
})

test('the theater: every skit frame fills the width and rows, and it acts the beats out', () => {
  const skit = SKITS()[0]!
  const bare: MuseSkit = { ...skit, place: null, look: null }
  const texts: string[] = []
  for (const s of [skit, bare]) {
    for (const w of [16, 40, 81, 160]) {
      for (let t = 0; t < skitLength(s) + 20; t += 3) {
        const g = skitScene(s, t, w, 5)
        expect(g).toHaveLength(SHOW_ROWS)
        for (const row of g) expect(widthOf(row)).toBe(w)
        if (w === 81) texts.push(g.map(r => r.map(c => c.ch).join('')).join('\n'))
      }
    }
  }
  const all = texts.join('\n')
  for (const said of ['Night fishing', 'a bug?', 'gotcha', 'fixed!', '?', 'z']) expect(all).toContain(said)
})

test('muse: copies of the format example are dropped; the seed decides when to ask', () => {
  const lamp = [['...CCCC...', '..CCCCCC..', 'BBBBBBBBBB', '.BBBBBBBB.', '...BBBB...'], ['....CC....', '...CCCC...', 'BBBBBBBBBB', '.BBBBBBBB.', '...BBBB...']]
  // The example's lamp, as sent and as a model once sent it back with a few pixels changed: dropped, and the beats that used it.
  const edited = [['...CCC...', '..CCCC..', 'BBBBBBBBBB', '.BBBBBBB.', '...BBBB...']]
  for (const frames of [lamp, edited]) {
    const copy = JSON.stringify({ skits: [{ title: 'Copied', props: [{ id: 'lamp', colors: { B: '#7aa2f7', C: '#ffd166' }, frames }], beats: [{ do: 'carry', prop: 'lamp' }, { do: 'wave' }] }] })
    const [skit] = parseSkits(copy, 'think')
    expect(skit!.props).toEqual([])
    expect(skit!.beats.map(b => [b.do, b.prop])).toEqual([['walk', null], ['wave', null]])
  }

  const empty: Muse = { skits: [] }
  expect(museNeed(empty, 'edit', 1)).toBe(true)
  const one = SKITS('edit')[0]!
  const full: Muse = { skits: new Array(MUSE_LOW).fill(one) }
  // Enough skits for edits, none for the shell.
  expect(museNeed(full, 'shell', 1)).toBe(true)
  let asks = 0
  for (let seed = 0; seed < 100 * 256; seed += 256) if (museNeed(full, 'edit', seed)) asks++
  expect(asks).toBeGreaterThan(20)
  expect(asks).toBeLessThan(50)
})
