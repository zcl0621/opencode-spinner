// `/spinner`'s arguments to what they ask for; plugin.tsx carries it out.

export type SpinnerCommand = { kind: 'status' } | { kind: 'pat' } | { kind: 'unknown'; name: string }

export const USAGE = '[status|pet]'

export function parseCommand(args: string): SpinnerCommand {
  const verb = args.trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (verb === '' || verb === 'status') return { kind: 'status' }
  if (verb === 'pet') return { kind: 'pat' }
  return { kind: 'unknown', name: verb }
}
