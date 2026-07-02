import type {Config} from '@oclif/core'

import {vi} from 'vitest'

export const fakeOclifConfig = {
  runHook: async () => ({failures: [], successes: []}),
} as unknown as Config

export function silenceLogs(cmd: {log: (...args: unknown[]) => void; warn: (...args: unknown[]) => unknown}) {
  const log = vi.spyOn(cmd, 'log').mockImplementation(() => {})
  const warn = vi.spyOn(cmd, 'warn').mockImplementation((input) => input)
  return {log, warn}
}
