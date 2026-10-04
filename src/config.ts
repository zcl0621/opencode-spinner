// The plugin's options (the `options` of its entry in opencode's `plugins`),
// read once into a typed config. `/spinner` commands override them; what they
// set is kept in the plugin's storage (see plugin.tsx).
import { THEME_NAMES } from './themes'
import type { ThemeName } from './themes'

export type Choice = ThemeName | 'random'

export const CHOICES: readonly Choice[] = ['random', ...THEME_NAMES]

export type Config = {
  /** A theme, or `random` for a new one each time the TUI starts. */
  theme: Choice
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
}

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)
function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : fallback
}

export function readConfig(options: Readonly<Record<string, unknown>>): Config {
  return {
    theme: oneOf(options.theme, CHOICES, 'random'),
    isVisible: flag(options.visible, true),
    hasFooterButton: flag(options.footerButton, true),
    hasStage: flag(options.stage, true),
    hasFinale: flag(options.celebrate, true),
    hasCompanion: flag(options.companion, true),
    isStill: flag(options.reducedMotion, false),
    language: text(options.language, 'auto'),
  }
}
