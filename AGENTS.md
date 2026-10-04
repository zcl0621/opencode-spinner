# opencode-spinner: notes for agents

To install, configure, update or remove this plugin for someone, follow [INSTALL.md](INSTALL.md). What the plugin does is in [README.md](README.md). The rest of this file is for agents changing the code.

## What it is

A TUI plugin for opencode 2.x. It draws Clawd's pixel show above the prompt (a workbench and a skatepark, taking turns), a pet with a speech bubble, and a finale when a turn ends, and it registers `/spinner` (`status` and `pet` only). It adds no tools or agents. In the background it asks a model for show content (`src/muse.ts`), and on macOS it seeds its randomness from system sound (`src/audio.ts`, `src/tap.ts`).

## Working on this repository

- Runtime: opencode 2's TUI plugin API (`@opencode/plugin/tui`), OpenTUI and SolidJS. Entry: `tui.tsx`, which re-exports `src/plugin.tsx`.
- Any file importing `solid-js` or `solid-js/store` must be `.tsx`. opencode rewrites those imports to its own Solid only in `.tsx` files; a `.ts` file binds to a second copy (or fails to resolve without `node_modules`) and the UI stops reacting.
- Solid stores merge objects on set. To remove a key, use `produce` with `delete`, and never set a nested path whose parent doesn't exist yet: that throws and freezes every animation.
- Drawing code (`cells.ts`, `scenes.ts`, `show.ts`, `clawd.ts`, `skate.ts`, `themes.ts`, `pets.ts`) is pure: a function of the tick, the width, the act, the model's content and the seed. Keep it that way; randomness comes in only through the seed.
- What the model writes is untrusted. `muse.ts` reads it strictly (lengths, enums, colors, pixel keys) and drops anything off. New fields need the same strictness.
- New settings go in `cli.json` options (`src/config.ts`), not in new `/spinner` commands; the command stays at `status` and `pet`.
- Tests must not start the sound tap or call a model: `test/spinner.test.ts` starts the controller with `sound: false` and `model: false` unless a test passes a fake client.
- Checks before committing:

  ```bash
  bun install
  bun run typecheck
  bun run test   # bun test --conditions browser (Solid's reactive build)
  ```

- To try changes live, symlink the repo into a test project's `.opencode/plugins/` and run opencode there; plugins hot-reload on save. `bun scripts/gallery.ts` regenerates the images in `assets/`.
