import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/template/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

function makeCmd(templates: unknown[]) {
  const cmd = new List([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const get = vi.fn().mockResolvedValueOnce(templates)
  ;(cmd as unknown as {wpClient: {get: typeof get}}).wpClient = {get}
  return {cmd, get, logs}
}

describe('template list', () => {
  it('prints one line per template and returns them without their markup', async () => {
    const {cmd, get, logs} = makeCmd([{html: '<!-- wp:post-content /-->', slug: 'landing', title: 'Landing'}])

    const result = await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/templates')
    expect(result).toEqual([{slug: 'landing', title: 'Landing'}])
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual(['Found 1 template:', '', '  landing  Landing'])
  })

  it('says so when no template is managed by Loopress', async () => {
    const {cmd, logs} = makeCmd([])

    expect(await cmd.run()).toEqual([])
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual(['No templates managed by Loopress'])
  })
})
