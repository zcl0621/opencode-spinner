// Layers the scenes share: glyph stars over the cells, and a scrolling ground.
import { mod, noise, plot, put } from './cells'
import type { Canvas, Grid } from './cells'

/** The workbench scene's rows (clawd.ts): four rows, 8 px. */
export const SCENE_ROWS = 4

/** Stars as small glyphs over the cells (finer than a pixel): only where nothing is drawn. */
export function glyphStars(g: Grid, t: number, count: number, speed: number, glyphs: readonly string[], colors: readonly string[], seed = 0): void {
  const w = g[0]!.length
  for (let i = 0; i < count; i++) {
    const x = mod(Math.floor(noise(i + seed) * w * 3) - Math.floor(t * speed * (0.5 + noise(i + seed + 7))), w)
    const row = Math.floor(noise(i + seed + 3) * g.length)
    const cell = g[row]![x]!
    if (cell.ch !== ' ') continue
    const twinkle = mod(t + i * 5, 24)
    put(g, x, row, twinkle < 2 ? glyphs[1] ?? glyphs[0]! : glyphs[0]!, { c: colors[i % colors.length], d: twinkle >= 2 })
  }
}

/** The ground's top row: `colors` in a pattern that scrolls at `speed`. */
export function ground(cv: Canvas, t: number, y: number, speed: number, colors: readonly string[]): void {
  const off = Math.floor(t * speed)
  for (let x = 0; x < cv.w; x++) plot(cv, x, y, colors[mod(Math.floor((x + off) / 2), colors.length)]!)
}
