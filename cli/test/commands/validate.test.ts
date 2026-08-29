import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Validate from '../../src/commands/validate.js'
import {validateLocal} from '../../src/lib/validate-local.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'

vi.mock('../../src/lib/validate-local.js', () => ({
  validateLocal: vi.fn(),
}))

const originalExitCode = process.exitCode

describe('validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = originalExitCode
  })

  afterEach(() => {
    process.exitCode = originalExitCode
  })

  it('prints a clean summary and leaves the exit code untouched when valid', async () => {
    vi.mocked(validateLocal).mockResolvedValue({checked: 4, problems: [], valid: true})
    const cmd = new Validate([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)

    const result = await cmd.run()

    expect(result).toEqual({checked: 4, problems: [], valid: true})
    expect(log).toHaveBeenCalledWith('4 file(s) checked, no problems found.')
    expect(process.exitCode).toBe(originalExitCode)
  })

  it('prints every problem and sets a non-zero exit code when invalid', async () => {
    vi.mocked(validateLocal).mockResolvedValue({
      checked: 2,
      problems: [
        {file: 'forms/5.json', message: 'not valid JSON'},
        {file: 'loopress.json', message: 'projectId "ghost" is not a configured project'},
      ],
      valid: false,
    })
    const cmd = new Validate([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)

    await cmd.run()

    expect(log).toHaveBeenCalledWith('  ✗ forms/5.json: not valid JSON')
    expect(log).toHaveBeenCalledWith('  ✗ loopress.json: projectId "ghost" is not a configured project')
    expect(log).toHaveBeenCalledWith('2 file(s) checked, 2 problem(s) found.')
    expect(process.exitCode).toBe(1)
  })

  it('stays silent on stdout under --json so only the JSON payload is emitted', async () => {
    vi.mocked(validateLocal).mockResolvedValue({checked: 1, problems: [{file: 'x', message: 'y'}], valid: false})
    const cmd = new Validate(['--json'], fakeOclifConfig)
    const {log} = silenceLogs(cmd)

    const result = await cmd.run()

    expect(log).not.toHaveBeenCalled()
    expect(result.valid).toBe(false)
    expect(process.exitCode).toBe(1)
  })
})
