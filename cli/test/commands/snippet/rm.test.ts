import {describe, expect, it, vi} from 'vitest'

import Rm from '../../../src/commands/snippet/rm.js'
import {SNIPPETS_ENDPOINT} from '../../../src/utils/snippet-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

function make(argv: string[], del: ReturnType<typeof vi.fn>) {
  const cmd = new Rm(argv.filter((a) => !a.startsWith('--')), fakeOclifConfig)
  ;(cmd as unknown as {siteConfig: unknown}).siteConfig = makeEnv('production', 'https://acme.com')
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {delete: del}
  Object.assign(cmd, {dryRun: argv.includes('--dry-run'), yes: argv.includes('--yes')})
  silenceLogs(cmd)
  return cmd
}

describe('snippet rm', () => {
  it('deletes the snippet by id', async () => {
    const del = vi.fn().mockResolvedValue({})
    const result = await make(['12', '--yes'], del).run()
    expect(del).toHaveBeenCalledWith(`${SNIPPETS_ENDPOINT}/12`)
    expect(result).toEqual({id: 12, removed: true, status: 'success'})
  })

  it('deletes nothing on a dry run', async () => {
    const del = vi.fn()
    const result = await make(['12', '--dry-run'], del).run()
    expect(del).not.toHaveBeenCalled()
    expect(result.status).toBe('dry-run')
  })

  it('says so when the snippet is not on the site', async () => {
    const del = vi.fn().mockRejectedValue(new Error('nope', {cause: {response: {statusCode: 404}}}))
    await expect(make(['12', '--yes'], del).run()).rejects.toThrow('Snippet 12 is not on https://acme.com')
  })
})
