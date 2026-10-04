// Draws the scenes' cell grids and the pet's frames as OpenTUI text: one
// <text> per row, one <span> per run of one style.
import { TextAttributes } from '@opentui/core'
import { For } from 'solid-js'

import { segments } from './cells'
import type { Grid, Seg } from './cells'
import type { DockSeg } from './types'

function attributes(seg: { b?: boolean; d?: boolean }): number {
  return (seg.b ? TextAttributes.BOLD : 0) | (seg.d ? TextAttributes.DIM : 0)
}

/** Rows of runs, as `segments` gives them or as the pet's frames keep them. */
export function SegRows(props: { rows: readonly (readonly (Seg | DockSeg)[])[] }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <For each={props.rows}>
        {row => (
          <text wrapMode="none">
            <For each={row}>{seg => <span style={{ fg: seg.c, bg: seg.bg, attributes: attributes(seg) }}>{seg.text}</span>}</For>
          </text>
        )}
      </For>
    </box>
  )
}

/** A grid of cells (themes.ts, scenes.ts). */
export function GridRows(props: { grid: Grid }) {
  return <SegRows rows={props.grid.map(segments)} />
}
