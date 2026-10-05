// Where a skit plays (muse.ts, MusePlace; stage.ts draws it): a far layer
// behind the Clawds (a city, hills, mountains, a forest, the sea, dunes, snow,
// a room, a concert stage, a road, a beach, a library, a castle, a cave, the
// sea floor, a kitchen, a stadium, a haunted yard, a jungle, a classroom, or
// open space), something in the sky, and weather over it all. Pure: a function
// of the place, the tick and the scroll.
import { dot, mod, noise, plot, put } from './cells'
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
export function backdrop(cv: Canvas, place: MusePlace, scroll: number, base: number, top: number, t = 0): void {
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
      case 'stage': {
        // Curtains at both sides, footlights along the front, spotlights sweeping.
        const edge = Math.min(x, cv.w - 1 - x)
        if (edge < 5) {
          for (let y = top; y <= base; y++) plot(cv, x, y, mod(x, 2) ? near : dim(near, 0.75))
        } else if (mod(x, 4) === 0) plot(cv, x, base, accent)
        break
      }
      case 'road': {
        // Hills far off, lamp posts going by.
        column(x, Math.round(2 + Math.sin(u * 0.05) + 0.5 * Math.sin(u * 0.13)), far)
        const post = mod(u, 26)
        if (post === 0) column(x, 7, near)
        else if (post === 1 || post === 2) plot(cv, x, base - 6, post === 1 ? near : accent)
        break
      }
      case 'beach': {
        for (let y = Math.max(top, base - 2); y <= base; y++) plot(cv, x, y, mod(u + y * 3 + Math.floor(t / 4), 11) === 0 ? accent : y === base - 2 ? near : far)
        // A palm now and then: a leaning trunk and fronds.
        const palm = mod(u, 34)
        if (palm >= 2 && palm <= 3) column(x, 7 - (palm - 2), dim(near, 0.7))
        if (palm >= 0 && palm <= 6) plot(cv, x, base - 7 + Math.abs(palm - 3) / 2, '#9ece6a')
        break
      }
      case 'library': {
        // Shelves of books, spines in many colors.
        for (let y = top; y <= base; y++) {
          const shelf = mod(y - base, 4) === 0
          const book = noise(Math.floor(u / 2) * 7 + Math.floor((y - base) / 4) * 13)
          plot(cv, x, y, shelf ? near : book < 0.25 ? dim(accent, 0.8) : book < 0.5 ? far : book < 0.75 ? dim(far, 0.7) : dim(near, 0.8))
        }
        break
      }
      case 'castle': {
        // A wall with battlements, a tower with a lit window now and then.
        const tower = mod(u, 32) < 7
        const h = tower ? 8 : 5
        const top2 = mod(u, 2) === 0 ? h : h - 1
        column(x, top2, mod(Math.floor(u / 3) + Math.floor(base / 2), 2) ? far : dim(far, 0.85))
        if (tower && mod(u, 32) === 3) plot(cv, x, base - 5, accent)
        break
      }
      case 'cave': {
        // Stalactites from above, rocks below, a crystal glinting.
        const drip = Math.floor(noise(Math.floor(u / 3) + 11) * 4)
        for (let y = top; y < top + drip; y++) plot(cv, x, y, far)
        column(x, Math.floor(noise(Math.floor(u / 4) + 3) * 3), dim(far, 0.8))
        if (mod(u, 23) === 0) plot(cv, x, base - 1, accent)
        break
      }
      case 'underwater': {
        // Seaweed swaying, coral on the floor.
        const weed = mod(u, 9)
        if (weed === 0) for (let y = Math.max(top, base - 6); y <= base; y++) plot(cv, x + Math.round(Math.sin(t * 0.15 + y * 0.6 + u)), y, near)
        if (mod(u, 17) < 3) column(x, 2 + mod(u, 17), accent)
        break
      }
      case 'kitchen': {
        // Cabinets above, a counter below with a stove's knobs.
        for (let y = top + 1; y <= top + 3; y++) plot(cv, x, y, mod(u, 10) === 0 ? dim(far, 0.7) : far)
        column(x, 3, mod(u, 10) === 0 ? dim(near, 0.7) : near)
        if (mod(u, 10) === 5) plot(cv, x, base - 1, accent)
        break
      }
      case 'stadium': {
        // Stands full of fans, floodlights over them.
        for (let y = Math.max(top + 2, base - 5); y <= base - 1; y++) {
          const fan = noise(u * 3 + y * 17)
          plot(cv, x, y, fan < 0.3 ? accent : fan < 0.6 ? near : far)
        }
        plot(cv, x, base, dim(near, 0.6))
        if (mod(u, 30) === 0) column(x, 9, dim(near, 0.6))
        if (mod(u, 30) <= 2 && mod(u, 30) >= 0) plot(cv, x, base - 9, accent)
        break
      }
      case 'haunted': {
        // Bare trees, graves, a house with one lit window.
        const tree = mod(u, 28)
        if (tree === 4) column(x, 7, far)
        if (tree >= 2 && tree <= 6 && (tree + base) % 2 === 0) plot(cv, x, base - 5 - Math.abs(tree - 4), far)
        if (mod(u, 13) >= 10) column(x, 2, near)
        const house = mod(u, 60)
        if (house >= 40 && house <= 52) column(x, house === 46 ? 8 : 6, dim(far, 0.8))
        if (house === 44 || house === 48) plot(cv, x, base - 3, accent)
        break
      }
      case 'jungle': {
        // Trees behind, vines and big leaves hanging in front of the sky.
        column(x, 4 + Math.floor(noise(Math.floor(u / 5)) * 4), far)
        const vine = mod(u, 11)
        if (vine === 0) for (let y = top; y < top + 3 + Math.floor(noise(u) * 3); y++) plot(cv, x, y, near)
        if (vine >= 1 && vine <= 3) plot(cv, x, top + Math.abs(vine - 2), near)
        break
      }
      case 'classroom': {
        // A blackboard with chalk on it, desks in a row.
        const board = mod(u, 50)
        if (board < 30) for (let y = top + 1; y <= base - 3; y++) plot(cv, x, y, board === 0 || board === 29 ? near : noise(u * 5 + y * 11) > 0.9 ? accent : far)
        if (mod(u, 12) < 6) plot(cv, x, base - 1, near)
        if (mod(u, 12) === 1 || mod(u, 12) === 4) plot(cv, x, base, near)
        break
      }
      case 'space':
      case 'none':
        break
    }
  }
  // Spotlights on a stage: two beams of fine dots crossing as they sweep.
  if (place.backdrop === 'stage') {
    for (const [from, phase] of [[0.25, 0], [0.75, Math.PI]] as const) {
      const sx = cv.w * from * 2
      const aim = Math.sin(t * 0.05 + phase) * cv.w * 0.4
      for (let fy = top * 2; fy <= base * 2; fy += 2) {
        const p = (fy - top * 2) / Math.max(1, (base - top) * 2)
        dot(cv, sx + aim * p, fy, dim(accent, 0.55))
      }
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
  } else if (place.sky === 'clouds') {
    for (const cx of [Math.floor(cv.w * 0.2), Math.floor(cv.w * 0.6)]) {
      for (let dx = 0; dx < 7; dx++) plot(cv, cx + dx, top + 1, '#a9b1d6')
      for (let dx = 2; dx < 5; dx++) plot(cv, cx + dx, top, '#c0caf5')
    }
  } else if (place.sky === 'rainbow') {
    const bands = ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#7aa2f7', '#bb9af7']
    const cx = cv.w * 2 - 22
    bands.forEach((color, i) => {
      for (let a = 0; a <= 24; a++) {
        const ang = (Math.PI * a) / 24
        dot(cv, cx + Math.cos(ang) * (16 - i), top * 2 + 12 - Math.sin(ang) * (12 - i), color)
      }
    })
  } else if (place.sky === 'ufo') {
    for (let dx = 1; dx < 4; dx++) plot(cv, x + dx, top, '#7dcfff')
    for (let dx = -1; dx < 6; dx++) plot(cv, x + dx, top + 1, place.colors.near)
    for (let dx = 0; dx < 5; dx += 2) plot(cv, x + dx, top + 1, accent)
  }
}

/** A party color that changes with the tick. */
const frameColor = (t: number) => ['#ff6b9d', '#ffd166', '#9ece6a', '#7dcfff', '#bb9af7'][mod(Math.floor(t / 3), 5)]!

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
    case 'confetti':
      fall(Math.floor(w / 5), 0.3, 0.3, ['✻', '·', '*', '✶'], frameColor(t), false)
      break
    case 'fog':
      for (let i = 0; i < Math.floor(w / 3); i++) {
        const x = mod(Math.floor(noise(i + seed) * w * 2 + t * 0.1), w)
        const row = Math.floor(noise(i * 7 + seed) * rows)
        if (g[row]![x]!.ch === ' ') put(g, x, row, '░', { c: '#565f89', d: true })
      }
      break
    case 'embers':
      fall(Math.floor(w / 7), 0.25, 0.2, ['·', '•'], '#ff9e64', true)
      break
    case 'clear':
      break
  }
}
