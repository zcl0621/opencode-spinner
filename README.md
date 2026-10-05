# opencode-spinner

A little pixel theater that plays above the prompt while opencode 2.0 works. Its stars are Clawd, Claude's mascot, and up to two more Clawds in other colors. A model writes short skits about what the agent is doing (thinking, searching, editing, running a shell command, sending out subagents), each with its own place, cast, props, gags and lines: a band on stage, a road trip, a kung fu fight. The plugin acts them out. Between skits, and before any are written, he works at his bench. A Clawd pet stands beside the show, changing pose and speaking up as the agent works. When a turn ends, a short pixel finale shows how long it took, a different one each time.

The random seed that steers the model comes from whatever your Mac is playing, or from crypto when nothing is.

It started from the `spinner` mod that [hoobnn/hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/spinner) wrote for Claude Code (MIT), rewritten as an opencode 2.0 TUI plugin.

Installing it for someone? Agents can follow [INSTALL.md](INSTALL.md).

![Working: a skit the model wrote plays while the agent thinks](assets/opencode-working.svg)

![A finished turn: confetti, the time taken, the pet reports passing tests](assets/opencode-done.svg)

## The show

The show is six rows tall. What plays depends on what the agent is doing, and the plugin holds to one kind of work for at least six seconds, so a quick tool call doesn't cut a skit short. When the agent settles into new work, a skit about that work comes on; after it, bench visits and more skits take turns, in an order the turn's seed picks.

### Skits

A skit is a script the model writes and the plugin acts out. It has:

- a title, shown as it starts
- a cast of one to three Clawds, each with a name, a body color and a look: eyes (happy, closed, dizzy, hearts, shades, stars), a hat and something in hand, drawn by the model the way Clawd's stickers dress him, and now and then a holographic shimmer
- a place: a far backdrop (a city, hills, mountains, a forest, the sea, a desert, space, snow, a room, a concert stage with sweeping spotlights, a road with lamp posts going by, a beach, a library, a castle, a cave, the sea floor, a kitchen, a stadium full of fans, a haunted yard, a jungle or a classroom), something in the sky (a moon, a sun, a planet, clouds, a rainbow, a UFO) and weather (stars, rain, snow, leaves, fireflies, bubbles, sakura, confetti, fog, embers), in the model's colors
- up to four props the model draws: instruments, vehicles, food, tools, animals, anything. They move on their own (bob, float, fall, spin, blink, shake, orbit, grow, dance, hop, pace, sway, flap) and can keep an effect going, like notes over a jukebox or smoke over a pot
- two to ten beats. In each beat every Clawd can do something at the same time, and the ones without anything to do turn to watch

What a Clawd can do:

- move: walk, run, jump, fly, swim, ride a prop (a car, a boat, a broom; the world rolls by)
- strike a pose: wave, cheer, dance, bow, spin, sit, sleep, shiver, fall over, think, look at something, hide behind a prop
- use his hands: work, dig, paint, read, eat (the food gets smaller), hold something up, cast a spell
- play music: strum a guitar, drum, blow a horn, play keys, each with its own arm movements
- handle props: carry one overhead, throw it in an arc, push it along, kick it away
- deal with another Clawd: high-five, hug, chase (the other runs off), follow, punch or kick (the other reels, dizzy), throw him something (he catches it), cast a spell on him (stars in his eyes)

Each beat can set off an effect (sparks, hearts, music notes, zzz, steam, confetti, stars, bubbles, lightning, smoke, rain, `?`, `!`, an impact, dust, a thought bubble, tears, fire, wind), and any Clawd can say a line in your language. Many actions bring their own effect when the script names none: notes for music, dust for running, an impact for a punch.

The prompt asks for two very different skits at a time and, through the seed, names a kind of scene to stage one of them like, from films, novels and shows: a rock concert, a road trip, a heist, a kung fu duel, a cooking show, a haunted house, a western showdown, a rom-com meet-cute, and so on.

A skit runs 8 to 36 seconds. These three are hand-written to show what the theater can do (real ones come from the model): a band, a road trip, a kung fu fight.

![Moments of three skits: a three-Clawd band, a road trip, a kung fu fight](assets/theater.svg)

### The bench

The default scene. Clawd walks in (on foot, on a skateboard, or carrying a parcel), stops somewhere, gets to work, then leaves. What he does comes from 20 built-in vignettes that fit what the agent is doing: a magnifier, a book or a telescope while it searches; a laptop, a quill, paint or code blocks while it edits; an anvil, a cauldron, gears or a rocket launch while a shell command runs; juggling or a wobbling tower while subagents work; thought bubbles, a light bulb, fishing, coffee or a plant while it thinks.

![The workbench's 20 vignettes](assets/clawd.svg)

While a permission request or a question waits on you, Clawd goes back to his bench and holds up a `?` sign, whatever was playing.

### Pixels

Where the terminal can draw them, the show uses octant characters (Unicode 16): each cell holds 2 × 4 pixels, so Clawd and the model's art get twice the detail each way. Ghostty draws octants itself, so they are on there by default. Other terminals get half blocks (1 × 2 pixels a cell) unless you set `pixels: "fine"`. To see whether yours draws octants, run this and look for five small block shapes rather than boxes:

```bash
printf '\U0001CD00\U0001CD01\U0001CD0B\U0001CD5F\U0001CDE5\n'
```

## Content written by a model

This is on by default. The plugin still draws every frame itself. The model only writes skits as JSON, and the plugin checks them strictly before use: lengths, the cast, the lists of actions and effects, colors and pixel art are all bounded; an act missing the prop or partner it needs becomes a plain one (a `ride` without a vehicle is a walk), and props copied from the format example are dropped. Skits kept from earlier versions still play.

### When it asks

There is a chance at each turn's start, then at most every 40 seconds while tools run or the agent thinks. Each chance draws a seed and asks for skits about the work the agent is doing at that moment. With fewer than 3 kept for that kind of work, it always asks; otherwise the seed decides (about 35% of chances do). Only one request runs at a time, and it is given up after 5 minutes.

The request runs in the background. Meanwhile the show plays the skits it has, or the bench when it has none for the work at hand, so the animation never waits for the model.

The plugin keeps the latest 500 skits in its storage (`~/.local/state/opencode/latest/tui/plugin.opencode-spinner.muse.json`). They survive restarts and are shared by every opencode you have open.

### Which model

Set the `model` option in `cli.json`:

- unset, or `session` (the default): the current session's own model, through `session.generate`. Nothing is added to the session's history, but the session's context goes along, so the content may be about your project and costs a few more tokens.
- `provider/model-id`, such as `anthropic/claude-haiku-4-5`: that model, called directly through `generate.text` with a short prompt and no session context. Pick the smallest, fastest model you have. `opencode models` lists the ids.
- `false` or `"off"`: no model. The show plays the bench.

opencode's free models (`opencode/…-free`) refuse direct calls from plugins. The server answers "free tier can only be used from within OpenCode", and on that error the plugin switches to `session` by itself.

### Thinking

This content needs no deep thought. With a `provider/model-id`, the plugin picks that model's lightest reasoning variant: the first of `none`, `off`, `minimal` and `low` that the model has, or its default when it has none of those. `/spinner status` shows which one it used. Through `session`, the model and its variant are the session's own, and opencode's API doesn't let a plugin change them; the prompt only asks the model not to think long. Some of opencode's free models, nemotron among them, have no variants at all.

Measured on opencode 2.0.22 with the free `opencode/nemotron-3.5-lightning-free` through `session`: one batch of two skits took a few minutes (I didn't time it exactly), and one of its props was the format example's lamp with a few pixels changed (such props are now dropped). Its art is simple. A small model with your own key should be faster and draw better, but I had none to measure.

## The seed comes from sound

On macOS the plugin reads the band levels of whatever the system is playing and stirs them into a seed. It reads levels only; nothing is recorded, written or sent. The seed picks which skits play and when, and whether to ask the model. It also goes into the model's prompt, along with two theme words it picks (like "space" and "desserts"), so each batch comes out different.

With nothing playing, the sound too quiet, no macOS, no `swiftc`, or no recording permission, the seed comes from crypto and everything works the same.

On first use the plugin compiles a small helper from `src/audio-tap.swift` into `~/.cache/opencode-spinner/`. That takes about 2 seconds and needs macOS 14.2+ and `swiftc` (from `xcode-select --install`). macOS then asks once whether your terminal may record system audio. Set `sound: false` to skip all of this.

## The pet

The pet changes pose for thinking, running a tool, answering and waiting. Its bubble only says what opencode's own progress line doesn't: the tool running (`shell: npm test`, `edit: themes.ts`), or a permission request or question waiting for you (`❯ Waiting for your OK~`). Subagents running side by side are counted (`subagent ×3`). When the agent runs tests or commits, the pet says so for a few seconds (tests passed, tests failed, committed).

Each turn it puts on a new outfit, picked by the turn's seed: a party hat, a crown, a beanie, a top hat, headphones, a flower, a chef's hat, a coffee or a wand, or about half the time a hat or held thing from one of the skits the model wrote. Between turns it stays put: done, interrupted, error, and dozing after 5 quiet minutes. Every finished turn, passing test run and commit earns xp and levels (`Lv.4`). Click it, or type `/spinner pet`, to pat it (`♥12`, with floating hearts). Level and affection are kept across sessions, and every opencode you have open raises the same pet.

With the pet turned off (`companion: false`), Clawd stands in front of opencode's own progress bar instead (`▐▛█▜▌▭▭ ⬝⬝⬝■■ esc interrupt`).

A finished turn gets one of eight four-second finales next to the time taken (`✻ Done · 12s`): fireworks, a confetti cannon, a curtain call with the whole cast, a trophy, a disco ball, a rainbow dash, a high five, a level-up glow. An interrupted turn gets a rain cloud, a shrug or a walk-off; an error a glitch, an explosion or a short circuit. Which one plays follows the turn, so two turns in a row rarely match.

![All fourteen finales](assets/finale.svg)

 Under 60 columns or 20 rows the show steps aside and the pet shrinks to one line. The pet is four rows tall: the top one holds its hat. The **Spinner** label in the prompt footer turns all animations off and on.

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

- `/spinner status` (or just `/spinner`): the pet's level and affection, the model, how many skits are kept, the last error, and where the seed comes from now.
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
| `pixels` | `fine` (octants, 2 × 4 pixels a cell), `coarse` (half blocks), or `auto`: fine in Ghostty, coarse elsewhere | `auto` |

With `language` set to `auto`, the plugin follows the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`) and falls back to English.

## Development

```bash
bun install
bun run typecheck
bun run test            # = bun test --conditions browser
bun scripts/gallery.ts  # regenerates assets/clawd.svg, assets/theater.svg and assets/finale.svg
```

- `src/plugin.tsx` is the entry point. It claims UI slots (`session.composer.top` for the show and the pet, `prompt.footer.status` for Clawd on the progress line, `prompt.footer` for the toggle) and registers `/spinner`.
- `src/spinner.tsx` subscribes to opencode's events (`session.execution.*`, `session.tool.*`, `permission.*`, `form.*`) and keeps each session's state, the seed, the pet, and when to ask the model.
- `src/show.ts` latches what the agent is doing and cuts the turn into skits and bench visits. `src/stage.ts` is the theater that acts skits out, `src/place.ts` draws their places, and `src/clawd.ts` draws Clawd, the workbench and its 20 vignettes.
- `src/muse.ts` holds the skit format, the prompt, the strict reading of replies, and the decision whether to ask.
- `src/audio.ts`, `src/audio-tap.swift` and `src/tap.ts` are the sound seed, the system-audio helper, and the code that builds and runs it.
- `src/finale.ts` draws the finales. `src/themes.ts`, `src/scenes.ts`, `src/pets.ts` and `src/cells.ts` hold the theme, the shared layers, the pet, and the pixel canvas (octants or half blocks). `src/grid.tsx` draws a grid as OpenTUI text.
- `src/i18n.ts` and `src/lang.ts` hold the messages in each language.

Any file that imports `solid-js` must be a `.tsx` file. opencode only redirects modules for `.tsx` files; a `.ts` file gets a second copy of Solid, and the UI stops updating.

## Credits

The pet, the workbench art and the messages build on [hoobnn](https://github.com/hoobnn)'s [hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods) (MIT). This repository is also MIT; see [LICENSE](LICENSE).
