// spinner for the opencode 2.0 TUI: the band above the prompt (Clawd's show
// while a turn runs, the finale after, the pet beside it), the mascot in front
// of opencode's own running indicator, a footer toggle and `/spinner`.
import { Plugin } from '@opencode/plugin/tui'
import { TextAttributes } from '@opentui/core'
import type { BoxRenderable } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/solid'
import { createMemo, createSignal, onCleanup, Show } from 'solid-js'

import { parseCommand } from './command'
import { pixelModeOf, readConfig } from './config'
import { GridRows, SegRows } from './grid'
import { m, resolveLanguage, setLang } from './i18n'
import { levelOf } from './pet'
import { PET_ROWS } from './pets'
import { kindOf } from './muse'
import { nextStage } from './show'
import type { Stage } from './show'
import { createSpinner } from './spinner'
import type { Spinner } from './spinner'
import { SPRITE_MS, STAGE_MS, THEME, finaleScene, frame, padTo, poseOf, setPixels, textWidth } from './themes'
import type { DockPet } from './types'

/** Below this many columns, or this many terminal rows, the band draws the pet in one row. */
const COMPACT_COLUMNS = 60
const COMPACT_ROWS = 20
/** Cells the pet's bubble and stats take beside it. */
const PET_LABEL_W = 24

const TONE: Record<DockPet['tone'], { fg: string; attributes?: number }> = {
  plain: { fg: '#b8b8be' },
  ask: { fg: '#ffd166', attributes: TextAttributes.BOLD },
  error: { fg: '#e63946' },
  aborted: { fg: '#adb5bd' },
  sleep: { fg: '#6c757d', attributes: TextAttributes.DIM },
}

/** `text` cut to `w` cells, ending in `…` when cut. */
function clip(text: string, w: number): string {
  if (textWidth(text) <= w) return text
  let out = ''
  for (const ch of text) {
    if (textWidth(out + ch) > w - 1) break
    out += ch
  }
  return `${out}…`
}

/** A tick every `ms` while the component lives; none at all with reduced motion. */
function useTick(ms: number, isStill: boolean) {
  const [t, setT] = createSignal(0)
  if (!isStill) {
    const id = setInterval(() => setT(n => n + 1), ms)
    onCleanup(() => clearInterval(id))
  }
  return t
}

export default Plugin.define({
  id: 'opencode-spinner',
  setup(context) {
    const config = readConfig(context.options)
    setPixels(pixelModeOf(config.pixels, process.env))
    setLang(resolveLanguage(config.language, undefined, [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]))
    const spinner = createSpinner(context, config)

    context.ui.slot({ append: 'app', render: () => <Commands context={context} spinner={spinner} /> })
    context.ui.slot({ append: 'session.composer.top', render: input => <Band spinner={spinner} sessionID={input.sessionID} /> })
    context.ui.slot({
      prepend: 'prompt.footer.status',
      render: input => <Show when={input.sessionID}>{sid => <Mascot spinner={spinner} sessionID={sid()} />}</Show>,
    })
    if (config.hasFooterButton) {
      context.ui.slot({ append: 'prompt.footer', render: () => <FooterToggle context={context} spinner={spinner} /> })
    }

    return () => spinner.dispose()
  },
})

// ---- the band ----------------------------------------------------------------

function Band(props: { spinner: Spinner; sessionID: string }) {
  const s = props.spinner
  const dims = useTerminalDimensions()
  const [columns, setColumns] = createSignal(0)
  const t = useTick(STAGE_MS, s.config.isStill)
  const sid = createMemo(() => s.rootOf(props.sessionID))

  const pet = createMemo(() => s.dockOf(sid()))
  const isCompact = () => columns() < COMPACT_COLUMNS || dims().height < COMPACT_ROWS

  /** What the scene shows, if anything: the turn, or the finale. */
  const scene = createMemo(() => {
    if (!s.isVisible() || !s.hasStage() || isCompact()) return null
    const r = s.run(sid())
    if (r.isTurn) return { act: s.stateOf(sid()) === 'ask' ? ('ask' as const) : r.act, finale: null }
    if (r.finale) return { act: r.act, finale: r.finale }
    return null
  })

  const petColumns = () => (pet() && !isCompact() ? pet()!.width + 1 + PET_LABEL_W : 0)
  // Each scene plays from its own first frame: a turn, a finale.
  const sceneKey = createMemo(() => {
    const r = s.run(sid())
    if (r.isTurn) return `turn:${r.started}`
    return r.finale ? `finale:${r.finale.id}` : ''
  })
  let keyed = ''
  let base = 0
  // What the show plays for, latched as the agent's work changes (show.ts).
  let stage: Stage | undefined
  const grid = createMemo(() => {
    const sc = scene()
    if (!sc) return null
    // Two cells in on the left, one on the right, two between the scene and the pet's words.
    const w = Math.max(16, columns() - 5 - petColumns())
    if (sceneKey() !== keyed) {
      keyed = sceneKey()
      base = t()
      stage = undefined
    }
    const tick = t() - base
    if (sc.finale) return finaleScene(sc.finale.kind, sc.finale.label, tick, w)
    const tool = s.toolOf(sid()) || undefined
    stage = nextStage(stage, kindOf(sc.act, tool), tick, s.muse())
    return THEME.scene(tick, w, sc.act, tool, s.muse(), s.run(sid()).seed, stage)
  })

  return (
    <box
      width="100%"
      flexShrink={0}
      onSizeChange={function (this: BoxRenderable) {
        const width = this.width
        queueMicrotask(() => setColumns(width))
      }}
    >
      <Show when={grid() || pet()}>
        <Show
          when={!isCompact()}
          fallback={
            <Show when={pet()}>
              {p => (
                <box flexDirection="row" justifyContent="flex-end" paddingRight={1}>
                  <PetLine spinner={s} pet={p()} />
                </box>
              )}
            </Show>
          }
        >
          <box flexDirection="row" justifyContent="space-between" alignItems="flex-end" paddingLeft={2} paddingRight={1}>
            <Show when={grid()} fallback={<box />}>
              {g => <GridRows grid={g()} />}
            </Show>
            <Show when={pet() && !isCompact()}>
              <box width={petColumns()} flexShrink={0} flexDirection="row" justifyContent="flex-end">
                <PetBlock spinner={s} pet={pet()!} />
              </box>
            </Show>
          </box>
        </Show>
      </Show>
    </box>
  )
}

/** The bubble and stats, right-aligned, then the pet, PET_ROWS tall. A click pats it. */
function PetBlock(props: { spinner: Spinner; pet: DockPet }) {
  return (
    <box flexDirection="row" gap={1} flexShrink={1}>
      <box flexDirection="column" alignItems="flex-end" justifyContent="flex-end" width={PET_LABEL_W} height={PET_ROWS}>
        <text fg="#6c757d" wrapMode="none">
          {props.pet.stats}
        </text>
        <Show when={props.pet.bubble}>
          <text fg={TONE[props.pet.tone].fg} attributes={TONE[props.pet.tone].attributes} wrapMode="none">
            {clip(`${props.pet.tone === 'ask' ? '❯ ' : ''}${props.pet.bubble}`, PET_LABEL_W)}
          </text>
        </Show>
      </box>
      <PetPlayer spinner={props.spinner} pet={props.pet} />
    </box>
  )
}

/** Plays the pet's loop; it starts over when the loop changes (another state, a pat). */
function PetPlayer(props: { spinner: Spinner; pet: DockPet }) {
  const t = useTick(props.pet.ms, props.spinner.config.isStill)
  let start = 0
  let id = ''
  const rows = createMemo(() => {
    const tick = t()
    if (props.pet.id !== id) {
      id = props.pet.id
      start = tick
    }
    const order = props.pet.order
    return props.pet.frames[order[(tick - start) % order.length] ?? 0] ?? []
  })
  return (
    <box flexShrink={0} width={props.pet.width} onMouseUp={() => props.spinner.patPet()}>
      <SegRows rows={rows()} />
    </box>
  )
}

/** The pet in one row, for a band too short or narrow for its block. */
function PetLine(props: { spinner: Spinner; pet: DockPet }) {
  return (
    <box flexDirection="row" gap={1} flexShrink={1} onMouseUp={() => props.spinner.patPet()}>
      <text fg={THEME.color} attributes={TextAttributes.BOLD} wrapMode="none">
        {THEME.sprite.say[0] ?? ''}
      </text>
      <Show when={props.pet.bubble}>
        <text fg={TONE[props.pet.tone].fg} attributes={TONE[props.pet.tone].attributes} wrapMode="none" truncate>
          {props.pet.tone === 'ask' ? '❯ ' : ''}
          {props.pet.bubble}
        </text>
      </Show>
      <text fg="#6c757d" wrapMode="none">
        {props.pet.stats}
      </text>
    </box>
  )
}

// ---- the mascot on opencode's running line -----------------------------------

/** One mascot at a time: with the pet showing above the prompt, it stays there. */
function Mascot(props: { spinner: Spinner; sessionID: string }) {
  const s = props.spinner
  const t = useTick(SPRITE_MS, s.config.isStill)
  const sid = createMemo(() => s.rootOf(props.sessionID))
  const shows = () => s.isVisible() && !s.hasCompanion() && s.run(sid()).isTurn
  const text = createMemo(() => {
    const frames = THEME.sprite[poseOf(s.stateOf(sid()))]
    return padTo(frame(frames, t()), Math.max(...frames.map(textWidth)))
  })
  return (
    <Show when={shows()}>
      <box flexShrink={0} marginLeft={1}>
        <text fg={THEME.color} attributes={TextAttributes.BOLD} wrapMode="none">
          {text()}
        </text>
      </box>
    </Show>
  )
}

// ---- the footer toggle -------------------------------------------------------

function FooterToggle(props: { context: Plugin.Context; spinner: Spinner }) {
  const theme = props.context.theme
  return (
    <box flexShrink={0} onMouseUp={() => props.spinner.setVisible(!props.spinner.isVisible())}>
      <text fg={props.spinner.isVisible() ? theme.text.base : theme.text.muted} wrapMode="none">
        Spinner
      </text>
    </box>
  )
}

// ---- /spinner ----------------------------------------------------------------

function Commands(props: { context: Plugin.Context; spinner: Spinner }) {
  const { context, spinner: s } = props
  const toast = (message: string) => context.ui.toast.show({ title: 'spinner', message })

  function status(): string {
    const lines = [m('cmd.petStats', { theme: 'Clawd', level: levelOf(s.pet.xp), xp: s.pet.xp, love: s.pet.love })]
    if (!s.isVisible()) lines.push(m('cmd.hidden'))
    const model = s.modelText()
    const muse = s.museState()
    const kept = s.muse()
    if (model) {
      const via = muse.via === 'session' && model.toLowerCase() !== 'session' ? ` ${m('cmd.museVia')}` : ''
      lines.push(`${m('cmd.museOn', { model, skits: kept.skits.length })}${muse.isBusy ? ` ${m('cmd.museBusy')}` : ''}${via}`)
      if (muse.error) lines.push(m('cmd.museError', { error: muse.error }))
    } else lines.push(m('cmd.museOff'))
    const tap = s.tap()
    const seed = s.lastSeed()
    if (!s.config.hasSoundSeed) lines.push(m('cmd.seedRandom'))
    else if (tap.error) lines.push(m('cmd.seedNoSound', { reason: tap.error }))
    else lines.push(m(tap.isAudible ? 'cmd.seedSound' : 'cmd.seedQuiet'))
    if (seed) lines.push(m('cmd.seedLast', { seed: seed.seed, from: seed.from }))
    lines.push(m('cmd.usage'))
    return lines.join('\n')
  }

  async function runCommand(args: string): Promise<void> {
    const command = parseCommand(args)
    switch (command.kind) {
      case 'status':
        await context.ui.dialog.alert({ title: 'spinner', message: status() })
        return
      case 'pat':
        return toast(m('cmd.pat', { theme: 'Clawd', love: s.patPet() }))
      case 'unknown':
        return toast(m('cmd.unknown', { name: command.name }))
    }
  }

  context.keymap.layer(() => ({
    mode: 'global',
    commands: [
      {
        id: 'spinner.command',
        title: 'Spinner',
        description: m('cmd.description'),
        group: 'Spinner',
        palette: true,
        slash: { name: 'spinner', arguments: true },
        run: input => runCommand(input ?? ''),
      },
      {
        id: 'spinner.pet',
        title: 'Spinner: pet Clawd',
        group: 'Spinner',
        palette: true,
        run: () => runCommand('pet'),
      },
    ],
  }))
  return null
}
