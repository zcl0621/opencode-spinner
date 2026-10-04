# opencode-spinner

A little pixel show that plays above the prompt while opencode 2.0 works. Clawd, Claude's mascot, is busy at his workbench one moment and skating through a skatepark the next. A Clawd pet stands beside the show, changing pose and speaking up as the agent thinks, runs tools and answers. When a turn ends, a burst of confetti shows how long it took.

A model writes much of what he does. While the agent runs `bun test`, Clawd may throw a `LINT GRIND +650` at the park or tinker with a prop the model drew. The random seed comes from whatever your Mac is playing, or from crypto when nothing is.

It started from the `spinner` mod that [hoobnn/hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/spinner) wrote for Claude Code (MIT), rewritten as an opencode 2.0 TUI plugin.

Installing it for someone? Agents can follow [INSTALL.md](INSTALL.md).

![Working: a model-written trick at the skatepark, the pet's bubble shows the command running](assets/opencode-working.svg)

![A finished turn: confetti, the time taken, the pet reports passing tests](assets/opencode-done.svg)

## The show

Each turn is cut into stretches. A stretch is either a visit to the workbench or a run through the skatepark, in an order the turn's seed picks, so no two turns look alike.

At the workbench, Clawd walks in (on foot, on a skateboard, or carrying a parcel), stops somewhere, gets to work, then leaves. What he does comes from 20 vignettes that fit what the agent is doing: a magnifier, a book or a telescope while it searches; a laptop, a quill, paint or code blocks while it edits; an anvil, a cauldron, gears or a rocket launch while a shell command runs; juggling or a wobbling tower while subagents work; thought bubbles, a light bulb, fishing, coffee or a plant while it thinks; a `?` sign while it waits on you. Props the model drew are mixed in.

![The workbench's 20 vignettes](assets/clawd.svg)

At the skatepark, the camera rides along as Clawd skates past obstacles laid out at random: drop-in decks, funbox pyramids, flat rails, stair sets (some gapped, some with a handrail to grind down), kickers and manual pads. Every obstacle gets a trick, its name and points pop up like in a skate game, and the run's score adds up in the corner:

- flips: ollie, kickflip, heelflip, 360 flip, varial flip, hardflip, laser flip, double kickflip, pop shove-it
- grabs: melon, indy
- grinds, with sparks: 50-50, 5-0, boardslide, nosegrind, crooked, smith, feeble
- manuals, nose manuals and drop-ins
- now and then a hard trick ends in a bail (`BAIL!`, points lost): Clawd hits the ground and the board rolls away

The model's tricks take most of the obstacles.

![Tricks at the skatepark](assets/skate.svg)

While a permission request or a question waits on you, Clawd goes back to his bench and holds up his sign, whatever was playing.

## Content written by a model

This is on by default. The plugin still draws every frame itself. The model only writes content as JSON, and the plugin checks it strictly before use, dropping anything malformed or copied from the format example. It writes two kinds:

- skatepark tricks: a name, how the board turns, and points, made up about what the agent is doing (`HANDRAIL REPO GRIND`, `SYNTAX GRAB`)
- workbench scenes: a pixel-art prop in two frames and a caption in your language

### When it asks

There is a chance at each turn's start, then at most every 40 seconds while tools run or the agent thinks. Each chance draws a seed. With fewer than 6 of a kind kept, it always asks, for the kind it has fewer of. With both kinds stocked, the seed decides whether to ask this time (about 35% of chances do). Only one request runs at a time, and it is given up after 5 minutes.

The request runs in the background. Meanwhile the show plays what is kept, or its own random content when nothing is kept yet, so the animation never waits for the model.

The plugin keeps the latest 500 of each kind in its storage (`~/.local/state/opencode/latest/tui/plugin.opencode-spinner.muse.json`). They survive restarts and are shared by every opencode you have open.

### Which model

Set the `model` option in `cli.json`:

- unset, or `session` (the default): the current session's own model, through `session.generate`. Nothing is added to the session's history, but the session's context goes along, so the content may be about your project and costs a few more tokens.
- `provider/model-id`, such as `anthropic/claude-haiku-4-5`: that model, called directly through `generate.text` with a short prompt and no session context. Pick the smallest, fastest model you have. `opencode models` lists the ids.
- `false` or `"off"`: no model. The show plays its own random content.

opencode's free models (`opencode/…-free`) refuse direct calls from plugins. The server answers "free tier can only be used from within OpenCode", and on that error the plugin switches to `session` by itself.

### Thinking

This content needs no deep thought. With a `provider/model-id`, the plugin picks that model's lightest reasoning variant: the first of `none`, `off`, `minimal` and `low` that the model has, or its default when it has none of those. `/spinner status` shows which one it used. Through `session`, the model and its variant are the session's own, and opencode's API doesn't let a plugin change them; the prompt only asks the model not to think long. Some of opencode's free models, nemotron among them, have no variants at all.

Measured on opencode 2.0.22 with the free `opencode/nemotron-3.5-lightning-free` through `session`: a batch of tricks took about 40 seconds, a batch of workbench props anywhere from 32 seconds to three and a half minutes, and one of its replies just copied the format example (such replies are dropped). A small model with your own key should be much faster, but I had none to measure.

## The seed comes from sound

On macOS the plugin reads the band levels of whatever the system is playing and stirs them into a seed. It reads levels only; nothing is recorded, written or sent. The seed picks what the turn plays first, how the parks are laid out and whether to ask the model. It also goes into the model's prompt, along with two theme words it picks (like "space" and "desserts"), so each batch comes out different.

With nothing playing, the sound too quiet, no macOS, no `swiftc`, or no recording permission, the seed comes from crypto and everything works the same.

On first use the plugin compiles a small helper from `src/audio-tap.swift` into `~/.cache/opencode-spinner/`. That takes about 2 seconds and needs macOS 14.2+ and `swiftc` (from `xcode-select --install`). macOS then asks once whether your terminal may record system audio. Set `sound: false` to skip all of this.

## The pet

The pet changes pose for thinking, running a tool, answering and waiting. Its bubble only says what opencode's own progress line doesn't: the tool running (`shell: npm test`, `edit: themes.ts`), or a permission request or question waiting for you (`❯ Waiting for your OK~`). Subagents running side by side are counted (`subagent ×3`). When the agent runs tests or commits, the pet says so for a few seconds (tests passed, tests failed, committed).

Between turns it stays put: done, interrupted, error, and dozing after 5 quiet minutes. Every finished turn, passing test run and commit earns xp and levels (`Lv.4`). Click it, or type `/spinner pet`, to pat it (`♥12`, with floating hearts). Level and affection are kept across sessions, and every opencode you have open raises the same pet.

With the pet turned off (`companion: false`), Clawd stands in front of opencode's own progress bar instead (`▐▛█▜▌▭▭ ⬝⬝⬝■■ esc interrupt`).

A finished turn gets confetti and the time taken (`▐▛█▜▌ ✻  Done · 12s`), an interrupted one a sad face, an error a glitchy flicker. Under 60 columns or 20 rows the show steps aside and the pet shrinks to one line. The **Spinner** label in the prompt footer turns all animations off and on.

## Install

You need **opencode 2.x** (tested on 2.0.22) and a truecolor terminal such as Ghostty, iTerm2, WezTerm or kitty.

To install it for every project, clone the repository into opencode's plugin folder, then restart opencode:

```bash
git clone --depth 1 https://github.com/zcl0621/opencode-spinner ~/.config/opencode/plugins/opencode-spinner
```

For a single project, clone it into that project's `.opencode/plugins/opencode-spinner` instead.

Options need a different setup: clone the repository anywhere, then list its absolute path with the options in `~/.config/opencode/cli.json`, and don't also put it in a plugin folder:

```json
{
  "plugins": [
    { "package": "/Users/you/src/opencode-spinner", "options": { "model": "anthropic/claude-haiku-4-5", "language": "en" } }
  ]
}
```

To update, run `git -C <clone folder> pull`. To uninstall, delete that folder or that entry in `cli.json`. [INSTALL.md](INSTALL.md) has the full steps, with checks and fixes.

## Commands

There are two:

- `/spinner status` (or just `/spinner`): the pet's level and affection, the model, how many tricks and scenes are kept, the last error, and where the seed comes from now.
- `/spinner pet`: pat Clawd.

The command palette (`ctrl+p`) also has **Spinner** and **Spinner: pet Clawd**.

## Options

Set these under `options` in the plugin's `cli.json` entry. All are optional.

| Option | What it does | Default |
| --- | --- | --- |
| `model` | The model that writes content: `session`, `provider/model-id`, or `false` for none | `session` |
| `sound` | Seed from the sound playing (macOS) | `true` |
| `visible` | Master switch for all animations. The footer's **Spinner** toggles it too, and that choice is kept | `true` |
| `footerButton` | The **Spinner** toggle in the prompt footer | `true` |
| `stage` | The show above the prompt | `true` |
| `celebrate` | The finale when a turn ends | `true` |
| `companion` | The pet | `true` |
| `reducedMotion` | Still frames only, still following the state | `false` |
| `language` | Text language: `auto`, `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `ru` | `auto` |

With `language` set to `auto`, the plugin follows the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`) and falls back to English.

## Development

```bash
bun install
bun run typecheck
bun run test            # = bun test --conditions browser
bun scripts/gallery.ts  # regenerates assets/clawd.svg and assets/skate.svg
```

- `src/plugin.tsx` is the entry point. It claims UI slots (`session.composer.top` for the show and the pet, `prompt.footer.status` for Clawd on the progress line, `prompt.footer` for the toggle) and registers `/spinner`.
- `src/spinner.tsx` subscribes to opencode's events (`session.execution.*`, `session.tool.*`, `permission.*`, `form.*`) and keeps each session's state, the seed, the pet, and when to ask the model.
- `src/show.ts` cuts a turn into workbench and skatepark stretches. `src/clawd.ts` draws the workbench and its 20 vignettes; `src/skate.ts` draws the park, the tricks and the score.
- `src/muse.ts` holds the prompts, the strict reading of replies, and the decision whether to ask.
- `src/audio.ts`, `src/audio-tap.swift` and `src/tap.ts` are the sound seed, the system-audio helper, and the code that builds and runs it.
- `src/themes.ts`, `src/scenes.ts`, `src/pets.ts` and `src/cells.ts` hold Clawd's look and the finale, the shared layers, the pet, and the cell grid. `src/grid.tsx` draws a grid as OpenTUI text.
- `src/i18n.ts` and `src/lang.ts` hold the messages in each language.

Any file that imports `solid-js` must be a `.tsx` file. opencode only redirects modules for `.tsx` files; a `.ts` file gets a second copy of Solid, and the UI stops updating.

## Credits

The pet, the workbench art and the messages build on [hoobnn](https://github.com/hoobnn)'s [hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods) (MIT). This repository is also MIT; see [LICENSE](LICENSE).
