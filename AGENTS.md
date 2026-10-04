# opencode-spinner: guide for agents

This file is for an AI agent (opencode or another coding agent) asked to install, configure or use this plugin for someone, and for agents working on this repository. The person-facing docs are [README.md](README.md) (Chinese) and [README.en.md](README.en.md).

## What it is

A TUI plugin for **opencode 2.x**. It adds Clawd's pixel show above the prompt (a workbench and a skatepark, taking turns), a companion pet with a speech bubble, a finale when a turn ends, and a `/spinner` command. It adds no tools or agents. By default it asks a model for fresh show content (skate tricks, workbench props) in the background, through the session's own model (`session.generate`, which adds nothing to the session's history); set `model: false` to stop that. It does not work with opencode 1.x (the `opencode-ai` npm package), whose plugin API is different.

## Install it for someone

1. Check the opencode version. It must be 2.x:

   ```bash
   opencode --version
   ```

   If it prints `1.x`, stop and tell the person this plugin needs opencode 2. opencode 2 is the `@opencode/cli` npm package.

2. Ask, or decide from the request, which install they want:
   - **Everywhere, default options** (the usual choice):

     ```bash
     git clone --depth 1 https://github.com/zcl0621/opencode-spinner ~/.config/opencode/plugins/opencode-spinner
     ```

     If `XDG_CONFIG_HOME` is set, the folder is `$XDG_CONFIG_HOME/opencode/plugins/` instead of `~/.config/opencode/plugins/`.
   - **One project only**: clone into `<project>/.opencode/plugins/opencode-spinner`.
   - **With options** (model, language, reduced motion…): clone anywhere, for example `~/.local/share/opencode-spinner`, then add an entry with the **absolute** path to `~/.config/opencode/cli.json`. Create the file if it is missing, and merge into an existing `plugins` array rather than replacing it:

     ```json
     {
       "plugins": [
         { "package": "/absolute/path/to/opencode-spinner", "options": { "model": "anthropic/claude-haiku-4-5", "language": "zh-Hans" } }
       ]
     }
     ```

     Don't also clone it into a `plugins/` folder: the folder copy loads without options. Options go in `cli.json`, not in `opencode.json` (`opencode.json` plugins are server plugins and don't pass options to the TUI).

   No `npm install` or build step is needed: opencode loads the TypeScript source directly and provides `solid-js`, `@opentui/*` and `@opencode/plugin` itself.

3. Tell the person to restart opencode.

4. Verify. In opencode's TUI:
   - the prompt footer shows a **Spinner** label (unless `footerButton: false`);
   - `/spinner status` opens a dialog with the pet's level and the model;
   - sending any prompt shows the scene and the pet above the input box while the agent works.

   If none of these appear, read opencode's log for the plugin's load error:

   ```bash
   grep -iE "plugin operation failed|failed to load plugin" ~/.local/share/opencode/log/opencode.log | tail -5
   ```

## Use it

Commands (type them in the prompt):

| Command | Effect |
| --- | --- |
| `/spinner status` (or `/spinner`) | Dialog: pet level/xp/affection, the model and how much content is kept, the last model error, where the seed comes from |
| `/spinner pet` | Pat the pet (+1 affection); clicking the pet does the same |

Clicking **Spinner** in the prompt footer turns all animations off / on (kept across restarts).

Options (in the `cli.json` entry's `options`, all optional): `model` (`session` by default, or `provider/model-id`, or `false` for none), `sound` (seed from the sound playing on macOS, default `true`), `visible`, `footerButton`, `stage`, `celebrate`, `companion`, `reducedMotion` (all booleans), `language` (`auto`, `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `ru`).

## Troubleshooting

- **The model writes nothing**: `/spinner status` shows the last error. `Model unavailable` means the id is wrong (list ids with `opencode models`, format `provider/model-id`). opencode's free models only work through `session` (the plugin falls back to it by itself). It only asks while the show can display, and once both kinds are stocked (6 each) only on about a third of its chances. Slow free models can take from 40 s to several minutes per batch; the show plays what is kept meanwhile.

- **Nothing shows above the prompt**: the show plays only while a turn runs (plus the finale for 3 s after it); the pet shows always. Check `/spinner status` for "animations off", and click **Spinner** in the footer to turn them back on. Under 60 columns or 20 rows only a one-line pet shows.
- **Colors look wrong or blocky**: the terminal lacks truecolor. Use Ghostty, iTerm2, WezTerm, kitty or similar.
- **The seed never comes from sound**: `/spinner status` gives the reason. With nothing playing it is random by design. Reading sound needs macOS 14.2+, `swiftc` (`xcode-select --install`) and System Audio Recording permission for the terminal (System Settings → Privacy & Security). The helper is built into `~/.cache/opencode-spinner/audio-tap`; delete it to force a rebuild. `sound: false` turns it off.
- **Options ignored**: the plugin is probably also in a `plugins/` folder, or the entry is in `opencode.json` instead of `cli.json`. (`visible` is overridden once the footer toggle has been clicked.)

## Working on this repository

- Runtime: opencode 2's TUI plugin API (`@opencode/plugin/tui`), OpenTUI + SolidJS. Entry: `tui.tsx` → `src/plugin.tsx`.
- **Any file importing `solid-js` or `solid-js/store` must be `.tsx`.** opencode rewrites those imports to its own Solid only in `.tsx` files; a `.ts` file binds to a second copy (or fails to resolve without `node_modules`) and the UI stops reacting.
- Solid stores merge objects on set; to remove a key use `produce` with `delete`, and never set a nested path whose parent doesn't exist yet (that throws and freezes every animation).
- Drawing code (`cells.ts`, `scenes.ts`, `show.ts`, `clawd.ts`, `skate.ts`, `themes.ts`, `pets.ts`) is pure: a function of the tick, the width, the act, the muse's content and the seed. Keep it so; randomness comes in only through the seed.
- What the model writes is untrusted: `muse.ts` reads it strictly (lengths, enums, colors, pixel keys) and drops anything off. Keep new fields that strict.
- Checks before committing:

  ```bash
  bun install
  bun run typecheck
  bun run test   # bun test --conditions browser (Solid's reactive build)
  ```

- To try changes live, symlink the repo into a test project's `.opencode/plugins/` and run opencode there; plugins hot-reload on save.
