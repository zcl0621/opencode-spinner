# Installing and configuring opencode-spinner

Step-by-step instructions for an AI agent (opencode or any coding agent) asked to install, configure, update or remove this plugin for someone. People can follow it too. What the plugin does is in [README.md](README.md).

## 1. Check the requirements

opencode must be 2.x:

```bash
opencode --version
```

If it prints `1.x`, stop and tell the person this plugin needs opencode 2 (the `@opencode/cli` npm package). opencode 1.x (the `opencode-ai` package) has a different plugin API and cannot load it.

`git` must be available. Nothing else is required: there is no `npm install` and no build step, because opencode loads the TypeScript source directly and provides `solid-js`, `@opentui/*` and `@opencode/plugin` itself.

The person's terminal should support truecolor (Ghostty, iTerm2, WezTerm, kitty and similar); without it the pixels look blocky.

## 2. Tell the person two things before installing

These are defaults they may want to change, so mention them up front:

- **A model writes show content in the background.** By default it uses the current session's own model (`session.generate`). Nothing is added to the session's history, but each request sends the session's context along and costs tokens on that model. A request happens at most once every 40 seconds while a turn runs, and less often once enough content is kept. They can pick a small model instead (`model: "provider/model-id"`) or turn it off (`model: false`).
- **On macOS it listens to system sound for a random seed.** It reads band levels only; nothing is recorded, written or sent. The first time, it compiles a small helper with `swiftc`, and macOS asks once whether the terminal may record system audio. Without permission, without `swiftc`, on other systems, or with nothing playing, it uses a crypto random seed instead. `sound: false` turns this off.

## 3. Pick an install method

| The person wants | Method |
| --- | --- |
| It everywhere, default options (the usual case) | A: plugin folder |
| It in one project only, default options | B: project plugin folder |
| Any option changed (model, sound, language, ...) | C: `cli.json` entry |

Options only reach the plugin through a `cli.json` entry (method C). A copy in a plugin folder always loads with the defaults.

### A: plugin folder

```bash
git clone --depth 1 https://github.com/zcl0621/opencode-spinner ~/.config/opencode/plugins/opencode-spinner
```

If `XDG_CONFIG_HOME` is set, use `$XDG_CONFIG_HOME/opencode/plugins/opencode-spinner` instead of `~/.config/opencode/plugins/opencode-spinner`.

### B: project plugin folder

```bash
git clone --depth 1 https://github.com/zcl0621/opencode-spinner <project>/.opencode/plugins/opencode-spinner
```

### C: `cli.json` entry, with options

1. Clone the repository somewhere stable. Do not put it in a `plugins/` folder (that copy would also load, without options):

   ```bash
   git clone --depth 1 https://github.com/zcl0621/opencode-spinner ~/.local/share/opencode-spinner
   ```

2. Add an entry to `~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`). Use the **absolute** path of the clone. If the file exists, read it first and add the entry to its `plugins` array; keep every other key and entry as it is. If the file does not exist, create it:

   ```json
   {
     "plugins": [
       { "package": "/Users/them/.local/share/opencode-spinner", "options": { "model": "anthropic/claude-haiku-4-5" } }
     ]
   }
   ```

   Put options in `cli.json`, not in `opencode.json`. Plugins listed in `opencode.json` are server plugins and get no options in the TUI.

## 4. Choose options

All options are optional; leave out any the person did not ask about.

| Option | Values | Default |
| --- | --- | --- |
| `model` | `"session"`, `"provider/model-id"`, or `false` | `"session"` |
| `sound` | `true` / `false`: seed from system sound (macOS) | `true` |
| `language` | `auto`, `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `ru` | `auto` (system locale, then English) |
| `visible` | `true` / `false`: all animations | `true` |
| `stage` | `true` / `false`: the show above the prompt | `true` |
| `companion` | `true` / `false`: the pet | `true` |
| `celebrate` | `true` / `false`: the finale after a turn | `true` |
| `footerButton` | `true` / `false`: the **Spinner** toggle in the footer | `true` |
| `reducedMotion` | `true` / `false`: still frames only | `false` |

### Choosing `model`

- **Keep the default (`"session"`)** if the person is happy for their session's model to write the content. This is the only way opencode's free models work: they refuse direct calls from plugins ("free tier can only be used from within OpenCode"). If the person sets a free model as `provider/model-id` anyway, the plugin falls back to the session's model by itself.
- **Use a small model** if they have a provider set up with a key. List the ids; each line is already in the `provider/model-id` form the option takes:

  ```bash
  opencode models
  ```

  Pick the smallest, fastest one (a "haiku", "mini", "flash" or "lite" model, for example). The plugin asks it with its lightest reasoning variant (`none`, `off`, `minimal` or `low`, whichever the model has), so thinking stays short.
- **Turn it off** with `false` if they want no model calls at all. The show still runs, with its own random content.

### Recipes

No model calls and no sound, the quietest setup:

```json
{ "package": "/abs/path/opencode-spinner", "options": { "model": false, "sound": false } }
```

A small model and Chinese text:

```json
{ "package": "/abs/path/opencode-spinner", "options": { "model": "anthropic/claude-haiku-4-5", "language": "zh-Hans" } }
```

Only the pet, no show above the prompt:

```json
{ "package": "/abs/path/opencode-spinner", "options": { "stage": false, "model": false } }
```

## 5. Restart and verify

Tell the person to restart opencode (quit every running TUI, then start it again). Then check, in the TUI:

1. The prompt footer shows a **Spinner** label (unless `footerButton: false`).
2. `/spinner status` opens a dialog. It shows the pet's level, the model (`Muse: session · kept: ...`, or `Muse: off`), and where the seed comes from.
3. Sending any prompt shows the show and the pet above the input box while the agent works.

`/spinner` with no argument may need Enter twice: once to accept the completion, once to run it.

If none of this appears, look for the plugin's load error:

```bash
grep -iE "plugin operation failed|failed to load plugin" ~/.local/share/opencode/log/opencode.log | tail -5
```

## 6. Fix common problems

| Symptom | Cause and fix |
| --- | --- |
| Nothing above the prompt | The show only plays while a turn runs (and 3 s after, for the finale); the pet is always there. The footer's **Spinner** may be off: click it. Under 60 columns or 20 rows only a one-line pet shows. |
| Options have no effect | The plugin is also in a `plugins/` folder (remove that copy), or the entry is in `opencode.json` instead of `cli.json`, or the path is not absolute. `visible` is overridden once the footer toggle has been clicked. |
| `/spinner status` shows a model error | `Model unavailable` means a wrong id: check it against `opencode models`. Other provider errors are shown as the provider sent them. |
| The model writes nothing for a long time | Free models can take from 40 s to several minutes per batch, and once enough content is kept the plugin asks only on about a third of its chances. The show plays what is kept meanwhile. |
| The seed never comes from sound | With nothing playing it is random by design. Otherwise it needs macOS 14.2+, `swiftc` (`xcode-select --install`) and System Audio Recording permission for the terminal (System Settings, Privacy & Security). The helper lives at `~/.cache/opencode-spinner/audio-tap`; delete it to force a rebuild. |
| Blocky or wrong colors | The terminal lacks truecolor. |

## 7. Update or uninstall

Update: `git -C <clone folder> pull`, then restart opencode.

Uninstall: delete the clone folder, and the entry in `cli.json` if there is one. The plugin's stored state (the pet's level, the content the model wrote) lives in opencode's state folder, in files named `plugin.opencode-spinner.*.json` under `~/.local/state/opencode/latest/tui/`; delete those too for a clean removal. The sound helper is in `~/.cache/opencode-spinner/`.
