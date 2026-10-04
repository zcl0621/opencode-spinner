// Plain data shared by the modules: what the pet and the band are shown from.

/** A run of cells in a pet's frame. */
export type DockSeg = { text: string; c?: string; bg?: string; b?: boolean; d?: boolean }

/** The companion as drawn: one loop of its current state. */
export type DockPet = {
  /** Changes with the state or a pat: the player starts over. */
  id: string
  /** Distinct frames, each its rows of runs. */
  frames: DockSeg[][][]
  /** The frames in play order, by index. */
  order: number[]
  ms: number
  /** Cells the pet takes across. */
  width: number
  bubble: string
  tone: 'plain' | 'ask' | 'error' | 'aborted' | 'sleep'
  /** `Lv.3 ♥12`. */
  stats: string
}
