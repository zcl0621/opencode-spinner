// spinner for the opencode 2.0 TUI: the band above the prompt (the theme's
// scene while a turn runs, its finale after, the pet beside it), the mascot in
// front of opencode's own running indicator, a footer toggle and `/spinner`.
import { Plugin } from '@opencode/plugin/tui'
import { TextAttributes } from '@opentui/core'
import type { BoxRenderable } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/solid'
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'

import { parseCommand } from './command'
import { CHOICES, readConfig } from './config'
import type { Choice } from './config'
import { GridRows, SegRows } from './grid'
import { m, resolveLanguage, setLang } from './i18n'
import { levelOf } from './pet'
import { PET_ROWS } from './pets'
import { createSpinner } from './spinner'
import type { Spinner } from './spinner'
import { SPRITE_MS, STAGE_MS, THEMES, THEME_NAMES, finaleScene, frame, hsl, padTo, poseOf, textWidth } from './themes'
import type { ThemeName } from './themes'
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

  /** What the scene shows, if anything: a preview, the turn, the audio theme listening, or the finale. */
  const scene = createMemo(() => {
    const shown = s.preview()
    if (shown) return { theme: shown.theme, act: 'think' as const, finale: null }
    if (!s.isVisible() || !s.hasStage() || isCompact()) return null
    const r = s.run(sid())
    const name = s.theme()
    const tap = s.tap()
    if (r.isTurn) return { theme: name, act: s.stateOf(sid()) === 'ask' ? ('ask' as const) : r.act, finale: null }
    if (name === 'audio' && tap.isLive && !tap.error && tap.isAudible && !r.finale) return { theme: name, act: 'wait' as const, finale: null }
    if (r.finale) return { theme: name, act: r.act, finale: r.finale }
    return null
  })

  const petColumns = () => (pet() && !isCompact() ? pet()!.width + 1 + PET_LABEL_W : 0)
  // Each scene plays from its own first frame: a turn, a finale, a preview.
  const sceneKey = createMemo(() => {
    const shown = s.preview()
    if (shown) return `preview:${shown.id}`
    const r = s.run(sid())
    if (r.isTurn) return `turn:${r.started}`
    return r.finale ? `finale:${r.finale.id}` : 'listen'
  })
  let keyed = ''
  let base = 0
  const grid = createMemo(() => {
    const sc = scene()
    if (!sc) return null
    const theme = THEMES[sc.theme]
    // Two cells in on the left, one on the right, two between the scene and the pet's words.
    const w = Math.max(16, columns() - 5 - petColumns())
    if (sceneKey() !== keyed) {
      keyed = sceneKey()
      base = t()
    }
    const tick = t() - base
    if (sc.finale) return finaleScene(theme, sc.finale.kind, sc.finale.label, tick, w)
    return theme.scene(tick, w, sc.act, s.audioFeed(sc.theme), s.toolOf(sid()))
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
          when={!isCompact() || s.preview()}
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
  const theme = () => THEMES[props.spinner.theme()]
  return (
    <box flexDirection="row" gap={1} flexShrink={1} onMouseUp={() => props.spinner.patPet()}>
      <text fg={theme().color} attributes={TextAttributes.BOLD} wrapMode="none">
        {theme().sprite.say[0] ?? ''}
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
    const frames = THEMES[s.theme()].sprite[poseOf(s.stateOf(sid()))]
    return padTo(frame(frames, t()), Math.max(...frames.map(textWidth)))
  })
  return (
    <Show when={shows()}>
      <box flexShrink={0} marginLeft={1}>
        <Show
          when={THEMES[s.theme()].isRainbow}
          fallback={
            <text fg={THEMES[s.theme()].color} attributes={TextAttributes.BOLD} wrapMode="none">
              {text()}
            </text>
          }
        >
          <text wrapMode="none">
            <For each={Array.from(text())}>
              {(ch, i) => <span style={{ fg: hsl((i() * 40 + t() * 24) % 360, 0.95, 0.62), attributes: TextAttributes.BOLD }}>{ch}</span>}
            </For>
          </text>
        </Show>
      </box>
    </Show>
  )
}

// ---- the footer toggle -------------------------------------------------------

function FooterToggle(props: { context: Plugin.Context; spinner: Spinner }) {
  const theme = props.context.theme
  return (
    <box flexShrink={0} onMouseUp={() => props.spinner.setSwitch('visible', !props.spinner.isVisible())}>
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
  const list = THEME_NAMES.join(' · ')

  function status(): string {
    const current = s.theme()
    const lines = [
      m('cmd.status', { theme: `${current}${s.choice() === 'random' ? m('cmd.randomNote') : ''}` }),
      m('cmd.petStats', { theme: current, level: levelOf(s.pet.xp), xp: s.pet.xp, love: s.pet.love }),
    ]
    if (!s.isVisible()) lines.push(m('cmd.hidden'))
    if (!s.hasStage()) lines.push(m('cmd.stageOff'))
    if (!s.hasCompanion()) lines.push(m('cmd.companionOff'))
    if (current === 'audio') {
      const { error } = s.tap()
      lines.push(error ? m('cmd.audioOff', { reason: error }) : m('cmd.audioOn'))
    }
    lines.push(m('cmd.themes', { list: THEME_NAMES.map(n => `${n} ${THEMES[n].happy}`).join(' · ') }), m('cmd.usage'))
    return lines.join('\n')
  }

  function switched(picked: Choice): string {
    const name = s.setChoice(picked)
    return picked === 'random' ? m('cmd.random', { theme: name }) : m('cmd.switched', { theme: name })
  }

  async function runCommand(args: string): Promise<void> {
    const command = parseCommand(args)
    switch (command.kind) {
      case 'status':
        await context.ui.dialog.alert({ title: 'spinner', message: status() })
        return
      case 'visible':
        s.setSwitch('visible', command.isOn)
        return toast(m(command.isOn ? 'cmd.shown' : 'cmd.hidden'))
      case 'stage':
        s.setSwitch('stage', command.isOn)
        return toast(m(command.isOn ? 'cmd.stageOn' : 'cmd.stageOff'))
      case 'companion':
        s.setSwitch('companion', command.isOn)
        return toast(m(command.isOn ? 'cmd.companionOn' : 'cmd.companionOff'))
      case 'pat':
        return toast(m('cmd.pat', { theme: s.theme(), love: s.patPet() }))
      case 'preview': {
        const name: ThemeName = command.theme ?? s.theme()
        s.showPreview(name)
        return toast(m('cmd.preview', { theme: name }))
      }
      case 'pick': {
        const picked = await context.ui.dialog.select<Choice>({
          title: 'spinner',
          current: s.choice(),
          options: CHOICES.map(c => ({ title: c, value: c, description: c === 'random' ? undefined : THEMES[c].happy })),
        })
        if (picked === undefined) return
        return toast(switched(picked))
      }
      case 'theme':
        return toast(switched(command.theme))
      case 'unknown':
        return toast(m('cmd.unknown', { name: command.name, list }))
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
        id: 'spinner.theme',
        title: 'Spinner: pick a theme',
        group: 'Spinner',
        palette: true,
        run: () => runCommand('theme'),
      },
      {
        id: 'spinner.pet',
        title: 'Spinner: pet the companion',
        group: 'Spinner',
        palette: true,
        run: () => runCommand('pet'),
      },
    ],
  }))
  return null
}

