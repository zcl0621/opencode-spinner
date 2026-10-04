// The sound tap: a small Swift program (audio-tap.swift) that reads the system
// output's band levels through Core Audio, 20 times a second, for the seed
// (audio.ts). Built with swiftc on first use into a cache folder. Only levels
// are read; nothing is recorded, written or sent.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdir, rename, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AUDIO_BANDS, SoundSeed, lineSplitter } from './audio'

const SOURCE = fileURLToPath(new URL('./audio-tap.swift', import.meta.url))

function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache')
  return path.join(base, 'opencode-spinner')
}

function run(argv: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr!.on('data', chunk => (stderr += String(chunk)))
    child.on('error', reject)
    child.on('close', code => resolve({ code: code ?? 1, stderr }))
  })
}

/** The tap's binary, built from its source on first use (and again when the source is newer). */
async function buildTap(): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('the sound seed reads system sound on macOS only')
  const dir = cacheDir()
  const bin = path.join(dir, 'audio-tap')
  const [built, source] = await Promise.all([stat(bin).catch(() => null), stat(SOURCE)])
  if (built && built.mtimeMs >= source.mtimeMs) return bin
  await mkdir(dir, { recursive: true })
  // Built aside and moved in: TUIs starting side by side may build at once.
  const temp = `${bin}.${process.pid}.tmp`
  let out
  try {
    out = await run(['swiftc', '-O', SOURCE, '-o', temp])
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)}; swiftc comes with xcode-select --install`)
  }
  if (out.code !== 0) {
    // swiftc warns before it errs: the first error is the one that says why.
    const lines = out.stderr.trim().split('\n')
    throw new Error(`swiftc: ${lines.find(l => /error:/.test(l))?.trim() || lines[0] || `exit ${out.code}`}`)
  }
  await rename(temp, bin)
  return bin
}

export type TapStatus = { isAudible: boolean; error: string | null }

/** Starts the tap: its lines into `meter`, `onStatus` told when sound starts or stops, or why it ended. */
export function startTap(meter: SoundSeed, onStatus: (status: TapStatus) => void): { stop: () => void } {
  let isStopped = false
  let child: ChildProcess | undefined
  const fail = (error: string) => {
    if (!isStopped) onStatus({ isAudible: false, error })
  }
  void (async () => {
    try {
      const bin = await buildTap()
      if (isStopped) return
      child = spawn(bin, [String(AUDIO_BANDS)], { stdio: ['ignore', 'pipe', 'pipe'] })
      const split = lineSplitter()
      let said = ''
      let wasAudible = false
      child.stdout!.on('data', chunk => {
        for (const line of split(String(chunk))) meter.push(line)
        if (meter.isAudible !== wasAudible) {
          wasAudible = meter.isAudible
          onStatus({ isAudible: wasAudible, error: null })
        }
      })
      child.stderr!.on('data', chunk => (said = String(chunk).trim() || said))
      child.on('error', err => fail(err.message))
      child.on('close', () => fail(said || 'the tap stopped'))
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
  })()
  return {
    stop: () => {
      isStopped = true
      child?.kill()
    },
  }
}
