# opencode-spinner: guide for agents

This file is for an AI agent (opencode or another coding agent) asked to install, configure or use this plugin for someone, and for agents working on this repository. The person-facing docs are [README.md](README.md) (Chinese) and [README.en.md](README.en.md).

## What it is

A TUI plugin for **opencode 2.x**. It adds an animated scene above the prompt, a companion pet with a speech bubble, a finale when a turn ends, and a `/spinner` command. It only changes the terminal UI; it adds no tools, agents or model behavior. It does not work with opencode 1.x (the `opencode-ai` npm package), whose plugin API is different.

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
   - **With options** (theme, language, reduced motion…): clone anywhere, for example `~/.local/share/opencode-spinner`, then add an entry with the **absolute** path to `~/.config/opencode/cli.json`. Create the file if it is missing, and merge into an existing `plugins` array rather than replacing it:

     ```json
     {
       "plugins": [
         { "package": "/absolute/path/to/opencode-spinner", "options": { "theme": "clawd", "language": "zh-Hans" } }
       ]
     }
     ```

     Don't also clone it into a `plugins/` folder: the folder copy loads without options. Options go in `cli.json`, not in `opencode.json` (`opencode.json` plugins are server plugins and don't pass options to the TUI).

   No `npm install` or build step is needed: opencode loads the TypeScript source directly and provides `solid-js`, `@opentui/*` and `@opencode/plugin` itself.

3. Tell the person to restart opencode.

4. Verify. In opencode's TUI:
   - the prompt footer shows a **Spinner** label (unless `footerButton: false`);
   - `/spinner status` opens a dialog with the theme and the pet's level;
   - sending any prompt shows the scene and the pet above the input box while the agent works.

   If none of these appear, read opencode's log for the plugin's load error:

   ```bash
   grep -iE "plugin operation failed|failed to load plugin" ~/.local/share/opencode/log/opencode.log | tail -5
   ```

## Use it

Commands (type them in the prompt; `/spinner` with no argument needs Enter twice, once to accept the completion):

| Command | Effect |
| --- | --- |
| `/spinner status` | Dialog: theme, pet level/xp/affection, theme list |
| `/spinner <theme>` | Switch theme: `clawd` `skate` `thunder` `chomp` `sparky` `bluecat` `nyan` `cat` `bunny` `sakura` `mecha` `neon` `dino` `ocean` `matrix` `audio` |
| `/spinner random` | A random theme each time opencode starts (never `audio`) |
| `/spinner theme` | Searchable theme picker |
| `/spinner preview [theme]` | Play a theme above the prompt for 8 seconds |
| `/spinner pet` | Pat the pet (+1 affection); clicking the pet does the same |
| `/spinner off` / `on` | All animations off / on (also: click **Spinner** in the footer) |
| `/spinner stage off` / `on` | Only the scene |
| `/spinner companion off` / `on` | Only the pet; with the pet off, the mascot rides on opencode's progress line |

Settings changed by commands persist in the plugin's storage and override `cli.json` options.

Options (in the `cli.json` entry's `options`): `theme` (a theme or `random`), `visible`, `footerButton`, `stage`, `celebrate`, `companion`, `reducedMotion` (all booleans), `language` (`auto`, `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `ru`).

## Troubleshooting

- **Nothing shows above the prompt**: the scene shows only while a turn runs (plus the finale for 3 s after it); the pet shows always. Check `/spinner status` for "animations off", or run `/spinner on`. Under 60 columns or 20 rows only a one-line pet shows.
- **Colors look wrong or blocky**: the terminal lacks truecolor. Use Ghostty, iTerm2, WezTerm, kitty or similar.
- **`audio` shows a sleeping dancer**: `/spinner status` gives the reason. It needs macOS 14.2+, `swiftc` (`xcode-select --install`) and System Audio Recording permission for the terminal (System Settings → Privacy & Security). The helper is built into `~/.cache/opencode-spinner/audio-tap`; delete it to force a rebuild.
- **Options ignored**: the plugin is probably also in a `plugins/` folder, or the entry is in `opencode.json` instead of `cli.json`, or a `/spinner` command already set that value (commands win).

## Working on this repository

- Runtime: opencode 2's TUI plugin API (`@opencode/plugin/tui`), OpenTUI + SolidJS. Entry: `tui.tsx` → `src/plugin.tsx`.
- **Any file importing `solid-js` or `solid-js/store` must be `.tsx`.** opencode rewrites those imports to its own Solid only in `.tsx` files; a `.ts` file binds to a second copy (or fails to resolve without `node_modules`) and the UI stops reacting.
- Solid stores merge objects on set; to remove a key use `produce` with `delete`, and never set a nested path whose parent doesn't exist yet (that throws and freezes every animation).
- Pure drawing code (`cells.ts`, `scenes.ts`, `themes.ts`, `pets.ts`, `audio.ts`, `i18n.ts`) is carried over from hoobnn's original; keep it pure and in sync in spirit.
- Checks before committing:

  ```bash
  bun install
  bun run typecheck
  bun run test   # bun test --conditions browser (Solid's reactive build)
  ```

- To try changes live, symlink the repo into a test project's `.opencode/plugins/` and run opencode there; plugins hot-reload on save.
