// Renders every theme (its working scene, its finale and its pet) into
// assets/gallery.svg with the plugin's own drawing code: `bun scripts/gallery.ts`.
import { mkdirSync, writeFileSync } from 'node:fs'

import { segments } from '../src/cells'
import type { Grid } from '../src/cells'
import { dockPetOf, petArtOf } from '../src/pets'
import { THEMES, THEME_NAMES, finaleScene } from '../src/themes'
import type { DockSeg } from '../src/types'

const CW = 8
const CH = 16
const SCENE_W = 72
const PET_GAP = 3
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
      if (ch === '█') out.push(`<rect x="${px}" y="${py}" width="${CW}" height="${CH}" fill="${fg}"${opacity}/>`)
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

const out: string[] = []
let y = 1
for (const name of THEME_NAMES) {
  const theme = THEMES[name]
  out.push(`<text x="${CW}" y="${y * CH + CH - 4}" fill="#7aa2f7" font-weight="bold">${name}</text>`)
  y += 1
  const scene = gridRuns(theme.scene(37, SCENE_W, 'tool'))
  const pet = dockPetOf(petArtOf(name, theme.color), 'tool', { id: name, bubble: '', tone: 'plain', stats: '' })
  const petRows: DockSeg[][] = pet.frames[pet.order[5] ?? 0] ?? []
  const rows = Math.max(scene.length, petRows.length)
  for (let r = 0; r < rows; r++) {
    const sceneRow = scene[r - (rows - scene.length)]
    if (sceneRow) row(out, sceneRow, 1, y + r)
    const petRow = petRows[r - (rows - petRows.length)]
    if (petRow) row(out, petRow, 1 + SCENE_W + PET_GAP, y + r)
  }
  y += rows
  for (const finaleRow of gridRuns(finaleScene(theme, 'answer', 'Done · 12s', 9, SCENE_W))) row(out, finaleRow, 1, y++)
  y += 1
}

const width = (SCENE_W + PET_GAP + 18) * CW
const height = y * CH
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Menlo, Monaco, 'DejaVu Sans Mono', monospace" font-size="13">`,
  `<rect width="100%" height="100%" fill="${BG}" rx="8"/>`,
  ...out,
  '</svg>',
].join('\n')
mkdirSync(new URL('../assets', import.meta.url), { recursive: true })
writeFileSync(new URL('../assets/gallery.svg', import.meta.url), svg)
console.log(`assets/gallery.svg: ${THEME_NAMES.length} themes, ${width}×${height}`)
