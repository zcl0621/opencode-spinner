// Where a skit plays (muse.ts, MusePlace; stage.ts draws it): a far layer
// behind Clawd (a city, hills, mountains, a forest, the sea, dunes, snow, a
// room or open space), something in the sky, and weather over it all. Pure: a
// function of the place, the tick and the scroll.
import { mod, noise, plot, put } from './cells'
import type { Canvas, Grid } from './cells'
import type { MusePlace } from './muse'
import { glyphStars } from './scenes'

/** A darker shade of a #rrggbb color. */
function dim(hex: string, by = 0.6): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * by).toString(16).padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

/**
 * The far layer, standing on `base` (the pixel row above the ground), drifting
 * with `scroll`; nothing rises above `top`.
 */
export function backdrop(cv: Canvas, place: MusePlace, scroll: number, base: number, top: number): void {
  const { far, near, accent } = place.colors
  const off = Math.floor(scroll)
  const column = (x: number, h: number, color: string) => {
    for (let y = Math.max(top, base - h + 1); y <= base; y++) plot(cv, x, y, color)
  }
  for (let x = 0; x < cv.w; x++) {
    const u = x + off
    switch (place.backdrop) {
      case 'city': {
        const b = Math.floor(u / 7)
        const h = 3 + Math.floor(noise(b + 40) * 6)
        for (let y = Math.max(top, base - h + 1); y <= base; y++) {
          const isWindow = mod(u, 7) % 2 === 1 && mod(y, 2) === 0 && noise(b * 13 + y) > 0.65
          plot(cv, x, y, isWindow ? dim(accent, 0.7) : mod(b, 2) ? far : dim(far, 0.8))
        }
        break
      }
      case 'hills':
        column(x, Math.round(4 + 1.5 * Math.sin(u * 0.08) + Math.sin(u * 0.21)), far)
        column(x, Math.round(2 + Math.sin(u * 0.13 + 2)), near)
        break
      case 'mountains': {
        const peak = Math.floor(u / 16)
        const h = 5 + Math.floor(noise(peak + 9) * 4)
        const d = Math.abs(mod(u, 16) - 8)
        const height = Math.max(0, h - d)
        column(x, height, far)
        if (height >= h - 1 && height > 0) plot(cv, x, base - height + 1, accent)
        break
      }
      case 'forest': {
        const tree = Math.floor(u / 6)
        const h = 3 + Math.floor(noise(tree + 21) * 4)
        const d = Math.abs(mod(u, 6) - 3)
        column(x, d === 0 ? h : Math.max(0, h - 1 - d * 2), noise(tree + 5) > 0.5 ? far : near)
        break
      }
      case 'sea':
        for (let y = Math.max(top, base - 2); y <= base; y++) plot(cv, x, y, mod(u + y * 3 + Math.floor(scroll * 2), 9) === 0 ? accent : y === base - 2 ? near : far)
        break
      case 'desert': {
        column(x, Math.round(2 + 1.2 * Math.sin(u * 0.06) + 0.6 * Math.sin(u * 0.17)), far)
        const cactus = mod(u, 23)
        if (cactus === 0) column(x, 4, near)
        else if (cactus === 1 || cactus === 22) plot(cv, x, base - 2, near)
        break
      }
      case 'snow': {
        column(x, Math.round(3 + Math.sin(u * 0.09) + 0.5 * Math.sin(u * 0.3)), near)
        const pine = Math.floor(u / 9)
        const d = Math.abs(mod(u, 9) - 4)
        if (noise(pine + 3) > 0.4 && d < 3) column(x, 6 - d * 2, far)
        break
      }
      case 'room': {
        // A wall, a window with the accent's light, a picture frame.
        for (let y = top; y <= base; y++) plot(cv, x, y, y === base ? dim(far, 0.8) : far)
        const wx = mod(u, 40)
        if (wx >= 6 && wx <= 13 && base - 7 >= top) for (let y = Math.max(top, base - 7); y <= base - 3; y++) plot(cv, x, y, wx === 6 || wx === 13 || y === base - 7 || y === base - 3 || wx === 9 ? near : dim(accent, 0.8))
        if (wx >= 24 && wx <= 28) for (let y = Math.max(top, base - 6); y <= base - 4; y++) plot(cv, x, y, wx === 24 || wx === 28 ? near : accent)
        break
      }
      case 'space':
      case 'none':
        break
    }
  }
}

/** What hangs in the sky, top right. */
export function skyBody(cv: Canvas, place: MusePlace, top: number): void {
  const x = cv.w - 9
  const { accent } = place.colors
  if (place.sky === 'moon') {
    for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [1, 1], [0, 2], [1, 2], [1, 3], [2, 3]]) plot(cv, x + dx!, top + dy!, accent)
  } else if (place.sky === 'sun') {
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) if (!((dy === 0 || dy === 3) && (dx === 0 || dx === 3))) plot(cv, x + dx, top + dy, accent)
  } else if (place.sky === 'planet') {
    for (let dy = 0; dy < 3; dy++) for (let dx = 1; dx < 4; dx++) plot(cv, x + dx, top + dy, place.colors.near)
    for (let dx = -1; dx < 6; dx++) plot(cv, x + dx, top + 1, accent)
  }
}

/** Weather over the cells, only where nothing is drawn. */
export function weather(g: Grid, place: MusePlace, t: number, seed: number): void {
  const w = g[0]!.length
  const rows = g.length
  const { accent, near } = place.colors
  const fall = (count: number, speed: number, drift: number, glyphs: readonly string[], color: string, rises = false) => {
    for (let i = 0; i < count; i++) {
      const path = t * speed + noise(i + seed) * rows * 7
      const row = mod(rises ? -Math.floor(path) : Math.floor(path), rows)
      const x = mod(Math.floor(noise(i * 3 + seed) * w * 2 + path * drift), w)
      const cell = g[row]![x]!
      if (cell.ch === ' ') put(g, x, row, glyphs[i % glyphs.length]!, { c: color, d: i % 3 === 0 })
    }
  }
  switch (place.weather) {
    case 'stars':
      glyphStars(g, t, Math.floor(w / 5), 0.02, ['·', '✦'], [accent, near], seed % 97)
      break
    case 'rain':
      fall(Math.floor(w / 4), 0.9, -0.6, ['╱'], near)
      break
    case 'snow':
      fall(Math.floor(w / 4), 0.25, 0.15, ['*', '·'], '#e8ecf5')
      break
    case 'leaves':
      fall(Math.floor(w / 8), 0.2, 0.5, ['•', '·'], accent)
      break
    case 'fireflies':
      for (let i = 0; i < Math.floor(w / 8); i++) {
        if (mod(t + i * 7, 20) > 9) continue
        const x = mod(Math.floor(noise(i + seed) * w + Math.sin(t * 0.1 + i) * 3), w)
        const row = Math.floor(noise(i * 5 + seed) * rows)
        if (g[row]![x]!.ch === ' ') put(g, x, row, '·', { c: accent, b: true })
      }
      break
    case 'bubbles':
      fall(Math.floor(w / 8), 0.15, 0.1, ['o', '°'], near, true)
      break
    case 'sakura':
      fall(Math.floor(w / 6), 0.2, 0.4, ['✿', '·'], accent)
      break
    case 'clear':
      break
  }
}
