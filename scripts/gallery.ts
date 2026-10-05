// Renders Clawd's workbench vignettes (assets/clawd.svg), moments of skits in
// the little theater (assets/theater.svg) and every finale (assets/finale.svg) with the plugin's own drawing
// code, in fine pixels: `bun scripts/gallery.ts`. The skits (samples.ts) are
// hand-written to show what the theater can act out; in use, they come from
// the model.
import { mkdirSync, writeFileSync } from 'node:fs'

import { octantBits, segments, setPixels } from '../src/cells'
import type { Grid } from '../src/cells'
import { VIGNETTES, benchScene, vignetteAt } from '../src/clawd'
import { parseSkits } from '../src/muse'
import { FINALE_VARIANTS, finale, finaleIdFor } from '../src/finale'
import type { FinaleKind } from '../src/finale'
import { skitScene } from '../src/stage'
import { SAMPLE_SKITS } from './samples'

setPixels('fine')

const CW = 8
const CH = 16
const BG = '#0a0a0a'
const FG = '#c0caf5'

type Run = { text: string; c?: string; bg?: string; b?: boolean; d?: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One row of runs at (x, y) in cells: half blocks as rectangles, the rest as text. */
function row(out: string[], runs: readonly Run[], x0: number, y: number): void {
  let x = x0
  for (const run of runs) {
    for (const ch of run.text) {
      const px = x * CW
      const py = y * CH
      const fg = run.c ?? FG
      const opacity = run.d ? ' opacity="0.5"' : ''
      if (run.bg) out.push(`<rect x="${px}" y="${py}" width="${CW}" height="${CH}" fill="${run.bg}"${opacity}/>`)
      const bits = octantBits(ch)
      if (bits !== null) {
        // Octants and the block characters among them: 2 × 4 fine pixels.
        for (let i = 0; i < 8; i++) {
          if (bits & (1 << i)) out.push(`<rect x="${px + (i % 2) * (CW / 2)}" y="${py + Math.floor(i / 2) * (CH / 4)}" width="${CW / 2}" height="${CH / 4}" fill="${fg}"${opacity}/>`)
        }
      } else if (ch === '█') out.push(`<rect x="${px}" y="${py}" width="${CW}" height="${CH}" fill="${fg}"${opacity}/>`)
      else if (ch === '▀') out.push(`<rect x="${px}" y="${py}" width="${CW}" height="${CH / 2}" fill="${fg}"${opacity}/>`)
      else if (ch === '▄') out.push(`<rect x="${px}" y="${py + CH / 2}" width="${CW}" height="${CH / 2}" fill="${fg}"${opacity}/>`)
      else if (ch !== ' ') {
        const weight = run.b ? ' font-weight="bold"' : ''
        out.push(`<text x="${px}" y="${py + CH - 4}" fill="${fg}"${weight}${opacity}>${esc(ch)}</text>`)
      }
      x += 1
    }
  }
}

const gridRuns = (g: Grid): Run[][] => g.map(segments)

// ---- clawd's vignettes: one frame of each, halfway in -------------------------

const CASES: [Parameters<typeof vignetteAt>[2], string | undefined][] = [
  ['tool', undefined],
  ['tool', 'grep: x'],
  ['tool', 'webfetch: x'],
  ['tool', 'edit: x'],
  ['tool', 'shell: x'],
  ['tool', 'subagent: x'],
  ['think', undefined],
  ['say', undefined],
  ['ask', undefined],
  ['wait', undefined],
]
const VW = 44
const found = new Map<string, Grid>()
for (const [act, tool] of CASES) {
  for (let t = 0; t < 60_000 && found.size < VIGNETTES.length; t++) {
    const now = vignetteAt(t, VW, act, tool)
    if (!now || found.has(now.vignette.name) || now.e !== 22) continue
    found.set(now.vignette.name, benchScene(t, VW, act, tool))
  }
}
const vout: string[] = []
let vy = 1
const names = VIGNETTES.map(v => v.name).filter(n => found.has(n))
names.forEach((name, i) => {
  const col = i % 2
  const top = 1 + Math.floor(i / 2) * 6
  vout.push(`<text x="${(1 + col * (VW + 3)) * CW}" y="${top * CH + CH - 4}" fill="#7aa2f7" font-weight="bold">${name}</text>`)
  gridRuns(found.get(name)!).forEach((r, k) => row(vout, r, 1 + col * (VW + 3), top + 1 + k))
  vy = Math.max(vy, top + 6)
})
const vwidth = (VW * 2 + 5) * CW
const vheight = vy * CH
writeFileSync(
  new URL('../assets/clawd.svg', import.meta.url),
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vwidth}" height="${vheight}" viewBox="0 0 ${vwidth} ${vheight}" font-family="Menlo, Monaco, 'DejaVu Sans Mono', monospace" font-size="13">`,
    `<rect width="100%" height="100%" fill="${BG}" rx="8"/>`,
    ...vout,
    '</svg>',
  ].join('\n'),
)
console.log(`assets/clawd.svg: ${names.length} of ${VIGNETTES.length} vignettes`)

// ---- the theater: hand-written skits, a few moments of each -------------------

const skits = parseSkits(JSON.stringify(SAMPLE_SKITS), 'think')
if (skits.length !== SAMPLE_SKITS.skits.length) throw new Error('a sample skit no longer parses')
const SW = 80
const moments: [string, number, number][] = [
  ['a band: strum, drum, keys', 0, 12],
  ['the bow', 0, 95],
  ['ride: the road rolls by', 1, 20],
  ['eat, then a hug', 1, 75],
  ['punch: the other reels', 2, 45],
  ['chase', 2, 100],
]
const sout: string[] = []
let sy = 1
moments.forEach(([name, k, t], i) => {
  const col = i % 2
  const top = 1 + Math.floor(i / 2) * 8
  sout.push(`<text x="${(1 + col * (SW + 3)) * CW}" y="${top * CH + CH - 4}" fill="#7aa2f7" font-weight="bold">${esc(name)}</text>`)
  gridRuns(skitScene(skits[k]!, t, SW, 3)).forEach((r, k) => row(sout, r, 1 + col * (SW + 3), top + 1 + k))
  sy = Math.max(sy, top + 8)
})
const swidth = (SW * 2 + 5) * CW
const sheight = sy * CH
writeFileSync(
  new URL('../assets/theater.svg', import.meta.url),
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${swidth}" height="${sheight}" viewBox="0 0 ${swidth} ${sheight}" font-family="Menlo, Monaco, 'DejaVu Sans Mono', monospace" font-size="13">`,
    `<rect width="100%" height="100%" fill="${BG}" rx="8"/>`,
    ...sout,
    '</svg>',
  ].join('\n'),
)
console.log(`assets/theater.svg: ${moments.length} moments of ${skits.length} skits`)

// ---- finales: every variant, a moment in --------------------------------------

const FW = 60
const fout: string[] = []
let fy = 1
const shots: [string, FinaleKind, number, number][] = []
const NAMES: Record<FinaleKind, string[]> = {
  answer: ['fireworks', 'confetti cannon', 'curtain call', 'trophy', 'disco', 'rainbow dash', 'high-five', 'level up'],
  aborted: ['rain cloud', 'shrug', 'walk off'],
  error: ['glitch', 'explosion', 'short circuit'],
}
const AT: Record<FinaleKind, number[]> = { answer: [14, 16, 20, 16, 12, 18, 15, 10], aborted: [12, 4, 20], error: [7, 13, 8] }
for (const kind of ['answer', 'aborted', 'error'] as const) {
  for (let n = 0; n < FINALE_VARIANTS[kind]; n++) shots.push([NAMES[kind][n]!, kind, n, AT[kind][n]!])
}
shots.forEach(([name, kind, n, t], i) => {
  const col = i % 2
  const top = 1 + Math.floor(i / 2) * 8
  fout.push(`<text x="${(1 + col * (FW + 3)) * CW}" y="${top * CH + CH - 4}" fill="#7aa2f7" font-weight="bold">${esc(`${kind}: ${name}`)}</text>`)
  const label = kind === 'answer' ? '✻ Done · 12s' : kind === 'aborted' ? 'Interrupted' : 'Error'
  gridRuns(finale(kind, label, t, FW, finaleIdFor(kind, n))).forEach((r, k) => row(fout, r, 1 + col * (FW + 3), top + 1 + k))
  fy = Math.max(fy, top + 8)
})
const fwidth = (FW * 2 + 5) * CW
const fheight = fy * CH
writeFileSync(
  new URL('../assets/finale.svg', import.meta.url),
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fwidth}" height="${fheight}" viewBox="0 0 ${fwidth} ${fheight}" font-family="Menlo, Monaco, 'DejaVu Sans Mono', monospace" font-size="13">`,
    `<rect width="100%" height="100%" fill="${BG}" rx="8"/>`,
    ...fout,
    '</svg>',
  ].join('\n'),
)
console.log(`assets/finale.svg: ${shots.length} finales`)
