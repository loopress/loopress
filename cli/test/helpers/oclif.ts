import type {Config} from '@oclif/core'

import {vi} from 'vitest'

export const fakeOclifConfig = {
  runCommand: vi.fn(),
  runHook: async () => ({failures: [], successes: []}),
} as unknown as Config

// fakeOclifConfig is a shared singleton imported across many test files. `restoreMocks` in
// vitest.config.ts only restores vi.spyOn spies, not this plain vi.fn(), so any suite that
// asserts on `runCommand` call counts must call this in its beforeEach.
export function resetFakeOclifConfig(): void {
  vi.mocked(fakeOclifConfig.runCommand).mockReset()
}

export function silenceLogs(cmd: {log: (...args: unknown[]) => void; warn: (...args: unknown[]) => unknown}) {
  const log = vi.spyOn(cmd, 'log').mockImplementation(() => {})
  const warn = vi.spyOn(cmd, 'warn').mockImplementation((input) => input)
  return {log, warn}
}
