// The plugin's options (the `options` of its entry in opencode's `cli.json`),
// read once into a typed config. The footer toggle overrides `visible`; what it
// sets is kept in the plugin's storage (see spinner.tsx).

export type Config = {
  isVisible: boolean
  /** A Spinner toggle in the prompt footer. */
  hasFooterButton: boolean
  hasStage: boolean
  hasFinale: boolean
  hasCompanion: boolean
  /** Every animation drawn as one still frame. */
  isStill: boolean
  /** `auto` or a language (lang.ts). */
  language: string
  /** The model the muse asks (muse.ts): `provider/model-id`, `session` (the default), or null: off. */
  model: string | null
  /** Seeds from the sound playing (macOS), else from crypto alone. */
  hasSoundSeed: boolean
  /** How pixels are drawn (cells.ts): `fine` octants, `coarse` half blocks, or `auto`: fine where the terminal is known to draw octants. */
  pixels: 'auto' | 'fine' | 'coarse'
}

/** Terminals known to draw octants themselves (whatever the font), by TERM_PROGRAM. */
const OCTANT_TERMINALS = ['ghostty']

/** The pixel mode for `pixels` in a terminal with these environment variables. */
export function pixelModeOf(pixels: Config['pixels'], env: Readonly<Record<string, string | undefined>>): 'fine' | 'coarse' {
  if (pixels !== 'auto') return pixels
  return OCTANT_TERMINALS.includes((env.TERM_PROGRAM ?? '').toLowerCase()) ? 'fine' : 'coarse'
}

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

export function readConfig(options: Readonly<Record<string, unknown>>): Config {
  // `model: false` (or "off") turns the muse off; unset asks the session's own model.
  const model = options.model === false ? 'off' : text(options.model, 'session')
  return {
    isVisible: flag(options.visible, true),
    hasFooterButton: flag(options.footerButton, true),
    hasStage: flag(options.stage, true),
    hasFinale: flag(options.celebrate, true),
    hasCompanion: flag(options.companion, true),
    isStill: flag(options.reducedMotion, false),
    language: text(options.language, 'auto'),
    model: ['off', 'none', 'false'].includes(model.toLowerCase()) ? null : model,
    hasSoundSeed: flag(options.sound, true),
    pixels: options.pixels === 'fine' || options.pixels === 'coarse' ? options.pixels : 'auto',
  }
}
