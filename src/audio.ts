// Sound as a source of randomness: lines from the tap (audio-tap.swift, run by
// tap.ts) stir a running hash while something plays. The seed it gives decides
// whether the muse is asked for new content and goes into its prompt; with
// nothing playing (or no tap), the seed comes from crypto instead.

/** Bands the tap is asked for, low to high. */
export const AUDIO_BANDS = 32
/** The tap's line period, in milliseconds. */
export const TAP_MS = 50

/** A tap line: `L <loudness> <band>...`, each 0..99; anything else is null. */
export function parseTapLine(line: string): { loud: number; bands: number[] } | null {
  const parts = line.trim().split(' ')
  if (parts[0] !== 'L' || parts.length < 3) return null
  const nums = parts.slice(1).map(Number)
  if (nums.some(n => !Number.isFinite(n))) return null
  const [loud, ...bands] = nums.map(n => Math.max(0, Math.min(99, n)))
  return { loud: loud!, bands }
}

/** Splits streamed text into whole lines, keeping a cut-off tail for the next piece. */
export function lineSplitter(): (text: string) => string[] {
  let rest = ''
  return text => {
    const lines = (rest + text).split('\n')
    rest = lines.pop() ?? ''
    return lines
  }
}

/** Below this a band is the tap's floor of hiss, not sound. */
const FLOOR = 6
/** Lines of quiet before the sound counts as gone (3 s). */
const QUIET_LINES = 60

/** FNV-1a over 32 bits, one number at a time. */
const mix = (hash: number, n: number) => Math.imul(hash ^ (n & 0xff), 0x01000193) >>> 0

/** The tap's lines in, a seed out while something plays. */
export class SoundSeed {
  private hash = 0x811c9dc5
  private lines = 0
  private sinceSound = QUIET_LINES

  /** Takes one tap line; returns whether it was a reading. */
  push(line: string): boolean {
    const reading = parseTapLine(line)
    if (!reading) return false
    const top = Math.max(0, ...reading.bands)
    this.sinceSound = top >= FLOOR ? 0 : this.sinceSound + 1
    if (top >= FLOOR) {
      this.hash = mix(this.hash, reading.loud)
      for (const band of reading.bands) this.hash = mix(this.hash, band)
      this.lines++
    }
    return true
  }

  /** Whether anything has played in the last few seconds. */
  get isAudible(): boolean {
    return this.sinceSound < QUIET_LINES
  }

  /** The sound's seed now, or null with nothing playing. */
  seed(): number | null {
    return this.isAudible && this.lines > 0 ? this.hash : null
  }
}

/** A seed from the sound if something plays, else from crypto; and which it was. */
export function seedFrom(sound: SoundSeed | null): { seed: number; from: 'sound' | 'random' } {
  const heard = sound?.seed() ?? null
  if (heard !== null) return { seed: heard, from: 'sound' }
  return { seed: crypto.getRandomValues(new Uint32Array(1))[0]!, from: 'random' }
}
