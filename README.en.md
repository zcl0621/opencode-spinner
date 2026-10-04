# opencode-spinner: working animations and a companion pet for opencode

[简体中文](README.md) · **English** · [Install guide for agents](AGENTS.md)

While opencode 2.0 works, a small show plays above the prompt: a pixel side-scrolling shooter, Clawd, a pac-man chase, a rainbow cat, and more. A pet stands beside it, changing pose and speaking up as the agent thinks, runs tools and answers. When a turn ends, a burst of confetti shows how long it took. There are 15 themes; one of them draws whatever your Mac is playing as a live spectrum.

This is a port of the `spinner` mod that [hoobnn/hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/spinner) wrote for Claude Code (MIT). The themes, the pet and the drawing code are kept as they were; the parts that hook into the host were rewritten as an opencode 2.0 TUI plugin.

![Working: the clawd theme, the pet's bubble shows the command running](assets/opencode-working.svg)

![A finished turn: confetti, the time taken, the pet reports passing tests](assets/opencode-done.svg)

## Features

- **Scene**: while the agent works, the theme's animation plays above the prompt.
- **Companion pet**: it changes pose for thinking, running a tool, answering and waiting. Its bubble only says what opencode's own progress line doesn't: the tool running (`shell: npm test`, `edit: themes.ts`), or a permission request or question waiting for you (`❯ Waiting for your OK~`). Subagents running side by side are counted (`subagent ×3`). When the agent runs tests or commits, it says so for a few seconds (tests passed, tests failed, committed).
- **Growing up**: between turns the pet stays put (done, interrupted, error, and dozing after 5 quiet minutes). Every finished turn, passing test run and commit earns xp and levels (`Lv.4`). Click it, or type `/spinner pet`, to pat it (`♥12`, with floating hearts). Level and affection are kept across sessions, and every opencode you have open raises the same pet.
- **Mascot on the progress line**: with the pet turned off (`/spinner companion off`), the mascot stands in front of opencode's own progress bar (`▐▛█▜▌▭▭ ⬝⬝⬝■■ esc interrupt`). Only one mascot shows at a time.
- **Finale**: when a turn ends, confetti bursts around the mascot with the time taken (`▐▛█▜▌ ✻  Done · 12s`); an interrupted turn gets a sad face, an error a glitchy flicker.
- **Narrow terminals**: under 60 columns or 20 rows, the scene steps aside and the pet shrinks to one line (mascot, bubble and level).
- **Reduced motion**: with `reducedMotion` on, every animation is one still frame that still follows the agent's state.
- **Footer toggle**: a **Spinner** label in the prompt footer turns all animations off and on.

## Themes

![The 15 themes: working scene, pet and finale](assets/gallery.svg)

Pixel scenes (three rows of half-block pixels):

- `clawd`: Claude's mascot Clawd strolls by and stops to work, a starburst spinning beside it. It types on a laptop while a tool runs and shows a `?` when waiting for you.
- `thunder`: a side-scrolling shooter. The fighter aims at waves of enemies, with explosions and a score; enemies come faster while a tool runs.
- `chomp`: a pac-man chased by four ghosts until it eats a power pellet.
- `sparky`: an electric mouse dashing along, cheeks crackling; lightning strikes while a tool runs.
- `bluecat`: a blue robot cat flying on a bamboo copter; gadgets drop from its pocket while a tool runs.
- `nyan`: a rainbow cat trailing a rainbow across the stars.

Character scenes (two rows): `cat`, `bunny`, `sakura`, `mecha`, `neon`, `dino`, `ocean`, `matrix`. Or pick `random` for a new theme each time opencode starts.

Sound scene (four rows): `audio` draws what your Mac is playing as a live spectrum, with a little dancer keeping the beat. While something plays it also shows between turns. `random` never picks it; choose it by name. It needs macOS 14.2+ and `swiftc` (`xcode-select --install`). On first use the plugin compiles a small helper from `src/audio-tap.swift` into `~/.cache/opencode-spinner/` (about 2 seconds) and runs it only while this theme shows. It reads the per-band levels of the system output through Core Audio; nothing is recorded, written or sent. macOS asks once whether your terminal may record system audio. When there is nothing to read, the dancer sleeps and `/spinner status` says why.

`chomp`, `sparky`, `bluecat` and `nyan` are tributes the original author drew from scratch under names of their own.

## Install

Requires **opencode 2.x** (tested on 2.0.22) and a truecolor terminal (Ghostty, iTerm2, WezTerm, kitty and so on).

To install it for every project, clone the repository into opencode's plugin folder:

```bash
git clone --depth 1 https://github.com/zcl0621/opencode-spinner ~/.config/opencode/plugins/opencode-spinner
```

Then restart opencode. For a single project, clone it into that project's `.opencode/plugins/opencode-spinner` instead.

To set options, install it a different way: clone the repository anywhere and list its absolute path with the options in `~/.config/opencode/cli.json` (and don't also put it in a plugin folder):

```json
{
  "plugins": [
    { "package": "/Users/you/src/opencode-spinner", "options": { "theme": "clawd", "language": "en" } }
  ]
}
```

To update: `git -C <clone folder> pull`. To uninstall: delete that folder, or that entry in `cli.json`.

## Commands

- `/spinner status` (or just `/spinner`): the theme, the pet's level and affection, and the list of themes.
- `/spinner <theme>`, `/spinner random`: switch themes. `/spinner theme` opens a searchable list.
- `/spinner preview [theme]`: play a theme above the prompt for 8 seconds.
- `/spinner pet`: pat the pet.
- `/spinner off` / `on`: all animations off or on. `/spinner stage off` / `on` covers only the scene, and `/spinner companion off` / `on` only the pet.

What these commands set is kept in the plugin's own storage, survives restarts and takes precedence over the options in `cli.json`. The command palette (`ctrl+p`) also has **Spinner**, **Spinner: pick a theme** and **Spinner: pet the companion**.

## Options

Set them under `options` in the plugin's `cli.json` entry:

| Option | What it does | Default |
| --- | --- | --- |
| `theme` | A theme, or `random` | `random` |
| `visible` | Master switch for all animations | `true` |
| `footerButton` | The **Spinner** toggle in the prompt footer | `true` |
| `stage` | The scene above the prompt | `true` |
| `celebrate` | The finale when a turn ends | `true` |
| `companion` | The companion pet | `true` |
| `reducedMotion` | Still frames only, still following the state | `false` |
| `language` | Text language: `auto`, `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `ru` | `auto` |

With `language` set to `auto`, the plugin follows the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`) and falls back to English.

## How it differs from the Claude Code version

- `/spinner` answers in opencode dialogs and toasts rather than in the conversation. `/spinner theme` uses opencode's searchable list with every theme in it.
- Options live in `cli.json`, not `/config`; command changes are kept in plugin storage and not written back to the config file.
- `random` draws once each time opencode starts (a hot reload keeps it).
- `language: auto` looks only at the system locale (opencode has no matching language setting).
- The original's integration with the `hud` mod (the pet docked in the HUD) wasn't ported; that mod doesn't exist for opencode.

## Development

```bash
bun install
bun run typecheck
bun run test            # = bun test --conditions browser
bun scripts/gallery.ts  # regenerates assets/gallery.svg
```

- `src/plugin.tsx`: the entry point. It claims UI slots (`session.composer.top` for the scene and pet, `prompt.footer.status` for the mascot on the progress line, `prompt.footer` for the toggle) and registers `/spinner`.
- `src/spinner.tsx`: subscribes to opencode's events (`session.execution.*`, `session.tool.*`, `permission.*`, `form.*`) and keeps each session's state, the pet, the settings and the audio helper.
- `src/themes.ts`, `src/scenes.ts`, `src/pets.ts`, `src/cells.ts`: themes, scenes, pets and the cell grid, carried over from the original. `src/grid.tsx` draws a grid as OpenTUI text.
- `src/audio.ts`, `src/audio-tap.swift`, `src/tap.ts`: the audio theme's level processing, the system-audio helper, and building and running it.
- `src/i18n.ts`, `src/lang.ts`: messages in each language.

Any file that imports `solid-js` must be a `.tsx` file. opencode only redirects modules for `.tsx` files; a `.ts` file gets a second copy of Solid, and the UI stops updating.

## Credits

Themes, pets, animations and messages come from [hoobnn](https://github.com/hoobnn)'s [hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods) (MIT). This repository is also MIT; see [LICENSE](LICENSE).
