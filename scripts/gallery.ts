// Renders Clawd's workbench vignettes (assets/clawd.svg) and frames of a skit
// in the little theater (assets/theater.svg) with the plugin's own drawing
// code, in fine pixels: `bun scripts/gallery.ts`. The skit is hand-written to
// show what the theater can act out; in use, skits come from the model.
import { mkdirSync, writeFileSync } from 'node:fs'

import { octantBits, segments, setPixels } from '../src/cells'
import type { Grid } from '../src/cells'
import { VIGNETTES, benchScene, vignetteAt } from '../src/clawd'
import { parseSkits } from '../src/muse'
import { skitScene } from '../src/stage'

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

// ---- the theater: a hand-written skit, a frame per beat ------------------------

const [skit] = parseSkits(
  JSON.stringify({
    skits: [
      {
        title: 'Night fishing for bugs',
        place: { backdrop: 'sea', sky: 'moon', weather: 'stars', colors: { far: '#1f2a44', near: '#3d59a1', ground: '#6b5a48', accent: '#e0af68' } },
        look: { eyes: 'normal', colors: { A: '#e0af68', B: '#8c6a3f' }, hat: ['..........BBBBBBBB', '........BAAAAAAAAB', '........BAAAAAAAAB', '......BBBBBBBBBBBBBB'], held: [] },
        props: [
          { id: 'bucket', x: 0.85, motion: 'still', colors: { G: '#9aa5ce', D: '#565f89', F: '#7aa2f7' }, frames: [['..DDDDDDDDDD..', '.DGGGGGGGGGGD.', '.DGFFFFFFFFGD.', '.DGGGGGGGGGGD.', '..DGGGGGGGGD..', '..DGGGGGGGGD..', '...DGGGGGGD...', '....DDDDDD....']] },
          { id: 'bug', x: 0.45, motion: 'float', colors: { K: '#9ece6a', E: '#1a1b26', W: '#c0caf5' }, frames: [['.W....W.', '..KKKK..', '.KEKKEK.', 'KKKKKKKK', '.K.KK.K.'], ['W......W', '..KKKK..', '.KEKKEK.', 'KKKKKKKK', 'K..KK..K']] },
        ],
        beats: [
          { do: 'walk', to: 0.25, secs: 2, effect: 'none', say: '' },
          { do: 'look', prop: 'bug', secs: 2, effect: 'question', say: 'a bug?' },
          { do: 'carry', prop: 'bug', to: 0.6, secs: 3, effect: 'sparks', say: 'gotcha' },
          { do: 'throw', prop: 'bug', to: 0.95, secs: 3, effect: 'none', say: '' },
          { do: 'cheer', secs: 2, effect: 'confetti', say: 'fixed!' },
          { do: 'sleep', secs: 2, effect: 'none', say: '' },
        ],
      },
    ],
  }),
  'think',
)
if (!skit) throw new Error('the sample skit no longer parses')
const SW = 64
const moments: [string, number][] = [['walk in', 8], ['look', 32], ['carry', 60], ['throw', 84], ['cheer', 105], ['sleep', 125]]
const sout: string[] = []
let sy = 1
moments.forEach(([name, t], i) => {
  const col = i % 2
  const top = 1 + Math.floor(i / 2) * 8
  sout.push(`<text x="${(1 + col * (SW + 3)) * CW}" y="${top * CH + CH - 4}" fill="#7aa2f7" font-weight="bold">${esc(name)}</text>`)
  gridRuns(skitScene(skit, t, SW, 3)).forEach((r, k) => row(sout, r, 1 + col * (SW + 3), top + 1 + k))
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
console.log(`assets/theater.svg: ${moments.length} moments of "${skit.title}"`)
