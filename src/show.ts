// The show: Clawd's whole day in one scene, six rows (12 px) tall. A turn is cut
// into stretches, each either a visit to his workbench (clawd.ts: walk in, a
// few vignettes, walk out) or a run through the skatepark (skate.ts: from one
// drop-in deck to the next). Which comes when, where he stops and the park's
// layout all follow the turn's seed (from the sound playing, or crypto), so
// no two turns look alike. A waiting ask always shows him at the bench, sign up.
import { blank, noise } from './cells'
import type { Grid } from './cells'
import { benchScene, benchSpan } from './clawd'
import type { Muse } from './muse'
import { SCENE_ROWS, glyphStars } from './scenes'
import { RUN_LENGTH, SKATE_ROWS, skateScene } from './skate'
import type { Act } from './themes'

export const SHOW_ROWS = SKATE_ROWS

/** How often a stretch is a skate run rather than the bench. */
const SKATE_SHARE = 0.45
/** An ask during a run loops within his stop at the bench (STOP is 120 ticks). */
const ASK_LOOP = 100

type Stretch = { kind: 'bench' | 'skate'; salt: number; local: number; start: number }

/** A small number per stretch, from the seed: noise() wants modest inputs. */
const saltOf = (seed: number, i: number) => ((seed % 9973) + i * 131) % 10007

/** The stretch playing at tick `t`, and how far into it. */
export function stretchAt(t: number, w: number, seed: number): Stretch {
  let from = 0
  for (let i = 0; ; i++) {
    const salt = saltOf(seed, i)
    const isSkate = noise(salt + 0.5) < SKATE_SHARE
    const span = isSkate ? { length: RUN_LENGTH, start: 0 } : benchSpan(w, salt, i === 0)
    if (t < from + span.length || i > 100_000) return { kind: isSkate ? 'skate' : 'bench', salt, local: t - from, start: span.start }
    from += span.length
  }
}

export function showScene(t: number, w: number, act: Act, tool?: string, muse?: Muse, seed = 0): Grid {
  const now = stretchAt(t, w, seed)
  if (now.kind === 'skate' && act !== 'ask') return skateScene(now.local, w, act, muse, now.salt)
  // The bench, four rows, under a strip of night sky. An ask in a skate run
  // shows him at his bench (a lap's stop starts at 0), holding up his sign.
  const g = blank(w, SHOW_ROWS)
  const bt = now.kind === 'skate' ? now.local % ASK_LOOP : now.start + now.local
  const bench = benchScene(bt, w, act, tool, muse, now.salt)
  bench.forEach((row, k) => (g[SHOW_ROWS - SCENE_ROWS + k] = row))
  const sky = g.slice(0, SHOW_ROWS - SCENE_ROWS)
  glyphStars(sky, t, Math.floor(w / 5), 0.03, ['·', '✦'], ['#565f89', '#7aa2f7', '#bb9af7'], now.salt % 97)
  return g
}
