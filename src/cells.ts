// Cells, pixels and numbers the scenes draw with. Pure; grid.tsx draws the
// result as OpenTUI text.

export type Style = { c?: string; bg?: string; b?: boolean; d?: boolean }
export type Cell = Style & { ch: string }
export type Seg = Style & { text: string }
export type Grid = Cell[][]

// ---- cells ---------------------------------------------------------------

/** Cells a code point takes: CJK, fullwidth forms and emoji two, the rest one. */
function cpWidth(cp: number): number {
  if (cp < 0x1100) return 1
  if (
    cp <= 0x115f ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2
  }
  return 1
}

export function textWidth(text: string): number {
  let w = 0
  for (const ch of text) w += cpWidth(ch.codePointAt(0)!)
  return w
}

/** `text` padded with spaces to `w` cells. */
export function padTo(text: string, w: number): string {
  return text + ' '.repeat(Math.max(0, w - textWidth(text)))
}

export function blank(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ' })))
}

/** Writes `text` at column `x` of row `y`, clipped to the grid; a wide character takes two cells. */
export function put(g: Grid, x: number, y: number, text: string, style: Style = {}): void {
  const row = g[y]
  if (!row) return
  let col = Math.round(x)
  for (const ch of text) {
    const w = cpWidth(ch.codePointAt(0)!)
    if (col >= 0 && col + w <= row.length) {
      // A wide character left half-covered would shift the rest of the row.
      if (row[col]!.ch === '' && col > 0) row[col - 1] = { ch: ' ' }
      row[col] = { ch, ...style }
      if (w === 2) row[col + 1] = { ch: '' }
      else if (col + 1 < row.length && row[col + 1]!.ch === '') row[col + 1] = { ch: ' ' }
    }
    col += w
  }
}

/** Like `put`, but each character keeps the background of the pixels under it. */
export function overlay(g: Grid, x: number, y: number, text: string, style: Style = {}): void {
  const row = g[y]
  if (!row) return
  let col = Math.round(x)
  for (const ch of text) {
    const under = row[col]
    const bg = under ? (under.ch === '█' ? under.c : under.bg) : undefined
    put(g, col, y, ch, bg && !style.bg ? { ...style, bg } : style)
    col += cpWidth(ch.codePointAt(0)!)
  }
}

/** A row as runs of one style each, what a Text per run draws. */
export function segments(row: Cell[]): Seg[] {
  const out: Seg[] = []
  for (const cell of row) {
    // The right half of a wide character: drawn by its left half.
    if (cell.ch === '') continue
    const last = out[out.length - 1]
    if (last && last.c === cell.c && last.bg === cell.bg && !!last.b === !!cell.b && !!last.d === !!cell.d) last.text += cell.ch
    else out.push({ text: cell.ch, c: cell.c, bg: cell.bg, b: cell.b || undefined, d: cell.d || undefined })
  }
  return out
}

// ---- pixels --------------------------------------------------------------

/**
 * How pixels become cells. `coarse`: two a cell, one above the other, in half
 * blocks every font has. `fine`: eight a cell (2 across, 4 down) in octants
 * (Unicode 16), which only some terminals draw: pixels half as wide and half
 * as tall, so art drawn with `drawFine` shows its detail.
 */
export type PixelMode = 'coarse' | 'fine'
let pixelMode: PixelMode = 'coarse'
export function setPixels(mode: PixelMode): void {
  pixelMode = mode
}
export const pixels = () => pixelMode

/**
 * A canvas `w` pixels across and `rows * 2` down, each pixel 2 × 2 fine ones:
 * `plot` and `draw` take whole pixels, `dot` and `drawFine` fine ones. With
 * `oy`, drawing at y lands `oy` pixels lower: a scene drawn for a short canvas
 * fits a taller one, with room above it.
 */
export type Canvas = { w: number; h: number; px: (string | undefined)[]; oy?: number }

export function canvas(w: number, rows: number, oy = 0): Canvas {
  return { w, h: rows * 2, px: new Array(w * rows * 8), oy }
}

/** A fine pixel: `fx`, `fy` count half pixels. */
export function dot(cv: Canvas, fx: number, fy: number, color: string): void {
  const x = Math.round(fx)
  const y = Math.round(fy) + (cv.oy ?? 0) * 2
  if (x >= 0 && x < cv.w * 2 && y >= 0 && y < cv.h * 2) cv.px[y * cv.w * 2 + x] = color
}

export function plot(cv: Canvas, x: number, y: number, color: string): void {
  const fx = Math.round(x) * 2
  const fy = Math.round(y) * 2
  dot(cv, fx, fy, color)
  dot(cv, fx + 1, fy, color)
  dot(cv, fx, fy + 1, color)
  dot(cv, fx + 1, fy + 1, color)
}

/** Draws pixel art: each character of `art` a pixel colored by `colors`, `.` left clear. */
export function draw(cv: Canvas, x: number, y: number, art: readonly string[], colors: Record<string, string>): void {
  art.forEach((line, j) => {
    for (let i = 0; i < line.length; i++) {
      const color = colors[line[i]!]
      if (color) plot(cv, x + i, y + j, color)
    }
  })
}

/** Draws art of fine pixels, its top left at pixel (`x`, `y`) (halves allowed). */
export function drawFine(cv: Canvas, x: number, y: number, art: readonly string[], colors: Record<string, string>): void {
  const fx = Math.round(x * 2)
  const fy = Math.round(y * 2)
  art.forEach((line, j) => {
    for (let i = 0; i < line.length; i++) {
      const color = colors[line[i]!]
      if (color) dot(cv, fx + i, fy + j, color)
    }
  })
}

/** Octants by pattern (bit `2 * row + column` of a cell's 2 × 4), where older block characters already draw it. */
const OCTANT_OLD: Record<number, string> = {
  0: ' ', 1: '\u{1CEA8}', 2: '\u{1CEAB}', 3: '\u{1FB82}', 5: '▘', 10: '▝', 15: '▀', 20: '\u{1FBE6}', 40: '\u{1FBE7}',
  63: '\u{1FB85}', 64: '\u{1CEA3}', 80: '▖', 85: '▌', 90: '▞', 95: '▛', 128: '\u{1CEA0}', 160: '▗', 165: '▚',
  170: '▐', 175: '▜', 192: '▂', 240: '▄', 245: '▙', 250: '▟', 252: '▆', 255: '█',
}
/** The rest are BLOCK OCTANT-…, from U+1CD00 in pattern order. */
const OCTANTS: string[] = (() => {
  const out: string[] = []
  let next = 0x1cd00
  for (let bits = 0; bits < 256; bits++) out.push(OCTANT_OLD[bits] ?? String.fromCodePoint(next++))
  return out
})()

/** Which fine pixels a block character fills (bits as in OCTANTS), or null for any other character. */
export function octantBits(ch: string): number | null {
  const bits = OCTANTS.indexOf(ch)
  return bits > 0 ? bits : null
}

const rgbOf = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgbOf(a)
  const [r2, g2, b2] = rgbOf(b)
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
}

/** The commonest drawn color among some pixels, or clear when none is drawn: thin lines of fine art survive. */
function commonest(px: (string | undefined)[]): string | undefined {
  const counts = new Map<string | undefined, number>()
  for (const p of px) if (p !== undefined) counts.set(p, (counts.get(p) ?? 0) + 1)
  let best: string | undefined
  let most = 0
  for (const [p, n] of counts) if (n > most || (n === most && best === undefined)) [best, most] = [p, n]
  return best
}

/** One cell of fine pixels (8, row by row) as an octant in at most two colors. */
function octantCell(px: (string | undefined)[]): Cell {
  const counts = new Map<string | undefined, number>()
  for (const p of px) counts.set(p, (counts.get(p) ?? 0) + 1)
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  if (ranked.length === 1 && ranked[0] === undefined) return { ch: ' ' }
  // The two commonest values stay; any other color joins the nearer drawn one.
  const keep = ranked.slice(0, 2)
  const drawn = keep.filter((p): p is string => p !== undefined)
  const fg = drawn[0]!
  const bg = keep.length > 1 ? keep.find(p => p !== fg) : undefined
  let bits = 0
  px.forEach((p, i) => {
    let v = p
    if (!keep.includes(v)) v = v === undefined ? bg : drawn.length > 1 && distance(v!, drawn[1]!) < distance(v!, fg) ? drawn[1] : fg
    if (v === fg) bits |= 1 << i
  })
  if (bits === 255) return { ch: '█', c: fg }
  return bg ? { ch: OCTANTS[bits]!, c: fg, bg } : { ch: OCTANTS[bits]!, c: fg }
}

/** The canvas as cells, in the pixel mode set (`setPixels`). */
export function cells(cv: Canvas, mode: PixelMode = pixelMode): Grid {
  const rows = cv.h / 2
  const fw = cv.w * 2
  const g = blank(cv.w, rows)
  const fine = (fx: number, fy: number) => cv.px[fy * fw + fx]
  for (let r = 0; r < rows; r++) {
    const row = g[r]!
    for (let x = 0; x < cv.w; x++) {
      if (mode === 'fine') {
        const px: (string | undefined)[] = []
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) px.push(fine(x * 2 + dx, r * 4 + dy))
        row[x] = octantCell(px)
        continue
      }
      // Coarse: each pixel the commonest drawn of its four fine ones, two a cell in half blocks.
      const pixel = (y: number) => commonest([fine(x * 2, y * 2), fine(x * 2 + 1, y * 2), fine(x * 2, y * 2 + 1), fine(x * 2 + 1, y * 2 + 1)])
      const top = pixel(2 * r)
      const bottom = pixel(2 * r + 1)
      if (top && bottom) row[x] = top === bottom ? { ch: '█', c: top } : { ch: '▀', c: top, bg: bottom }
      else if (top) row[x] = { ch: '▀', c: top }
      else if (bottom) row[x] = { ch: '▄', c: bottom }
    }
  }
  return g
}

// ---- numbers -------------------------------------------------------------

/** A fixed pseudo-random number in [0, 1) for each `n`. */
export function noise(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

export const mod = (n: number, m: number) => ((n % m) + m) % m

export function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = mod(n + h / 30, 12)
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function frame<T>(frames: readonly T[], t: number): T {
  return frames[mod(t, frames.length)]!
}
