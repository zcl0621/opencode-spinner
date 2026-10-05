// The show: six rows (12 px) above the prompt while a turn runs. Its default
// scene is Clawd's workbench (clawd.ts). Around it play skits the muse wrote
// (stage.ts) about what the agent is doing now: thinking, searching, editing,
// a shell command, subagents, the web, writing the answer. What the agent does
// is latched (`nextStage`) so the show doesn't flip every second; each time it
// settles on new work, a skit for that work comes on. Which skit, and how
// bench and skits alternate, follow the turn's seed (from the sound playing,
// or crypto). A waiting ask always shows him at the bench, sign up.
import { noise } from './cells'
import type { Grid } from './cells'
import { benchScene, benchSpan } from './clawd'
import { kindOf, skitsFor } from './muse'
import type { Kind, Muse } from './muse'
import { STAGE_ROWS, skitLength, skitScene } from './stage'
import type { Act } from './themes'

export const SHOW_ROWS = STAGE_ROWS

/** How often a stretch after the first is a skit, while there are some for the work at hand. */
const SKIT_SHARE = 0.75
/** Ticks the show keeps to one kind of work at least, and how long new work must last to take over. */
const HOLD = 60
const SETTLE = 15

/**
 * What the show plays for: the kind of work, since when (tick), and how many
 * skits for it were kept then (later ones wait for the next change, so the
 * one playing isn't swapped out).
 */
export type Stage = { kind: Kind; since: number; count: number; pending?: { kind: Kind; at: number } }

/** The stage after tick `t`, the agent doing `kind` (null: an ask, which changes nothing). */
export function nextStage(prev: Stage | undefined, kind: Kind | null, t: number, muse: Muse | undefined): Stage {
  const count = (k: Kind) => skitsFor(muse, k).length
  if (!prev) return { kind: kind ?? 'think', since: t, count: count(kind ?? 'think') }
  if (kind === null || kind === prev.kind) {
    // New skits for the work playing come on once it has had its time.
    if (kind !== null && count(kind) > prev.count && t - prev.since >= HOLD * 4) return { kind, since: t, count: count(kind) }
    return prev.pending ? { ...prev, pending: undefined } : prev
  }
  const pending = prev.pending?.kind === kind ? prev.pending : { kind, at: t }
  if (t - pending.at >= SETTLE && t - prev.since >= HOLD) return { kind, since: t, count: count(kind) }
  return { ...prev, pending }
}

type Stretch = { skit: number | null; salt: number; local: number; start: number }

/** A small number per stretch, from the seed: noise() wants modest inputs. */
const saltOf = (seed: number, i: number) => ((seed % 9973) + i * 131) % 10007

/** The stretch playing `local` ticks after the stage began, with `count` skits to choose from. */
export function stretchAt(local: number, w: number, seed: number, lengths: readonly number[]): Stretch {
  let from = 0
  for (let i = 0; ; i++) {
    const salt = saltOf(seed, i)
    // The first stretch after a change is a skit about the new work, when there is one.
    const isSkit = lengths.length > 0 && (i === 0 || noise(salt + 0.5) < SKIT_SHARE)
    const skit = isSkit ? Math.floor(noise(salt * 3 + 0.2) * lengths.length) : null
    const span = skit !== null ? { length: lengths[skit]!, start: 0 } : benchSpan(w, salt, i === 0)
    if (local < from + span.length || i > 100_000) return { skit, salt, local: local - from, start: span.start }
    from += span.length
  }
}

export function showScene(t: number, w: number, act: Act, tool?: string, muse?: Muse, seed = 0, stage?: Stage): Grid {
  const kind = stage?.kind ?? kindOf(act, tool) ?? 'think'
  const since = stage?.since ?? 0
  // The skits kept when the stage began: newest first, so they are the last `count`.
  const all = skitsFor(muse, kind)
  const pool = stage ? all.slice(Math.max(0, all.length - stage.count)) : all
  const now = stretchAt(t - since, w, (seed + since) % 100_003, pool.map(skitLength))
  if (now.skit !== null && act !== 'ask') return skitScene(pool[now.skit]!, now.local, w, now.salt)
  // The bench. An ask during a skit shows him there with his sign (a lap's stop starts at 0).
  const bt = now.skit !== null ? now.local % 100 : now.start + now.local
  return benchScene(bt, w, act, tool, now.salt, SHOW_ROWS)
}
