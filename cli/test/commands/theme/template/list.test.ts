import {describe, expect, it, vi} from 'vitest'

import List from '../../../../src/commands/theme/template/list.js'
import {fakeOclifConfig, silenceLogs} from '../../../helpers/oclif.js'

function makeCmd(child: unknown) {
  const cmd = new List([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const get = vi.fn().mockResolvedValueOnce(child)
  ;(cmd as unknown as {wpClient: {get: typeof get}}).wpClient = {get}
  return {cmd, get, logs}
}

const child = {
  active: true,
  customized: ['templates/single'],
  exists: true,
  parent: 'twentytwentyfive',
  parts: [{area: 'header', html: 'h', slug: 'header', title: 'Header'}],
  stylesheet: 'twentytwentyfive-loopress',
  templates: [{html: 's', slug: 'single'}],
}

describe('template list', () => {
  it('summarizes the child theme without the markup', async () => {
    const {cmd, get, logs} = makeCmd(child)

    const result = await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/child-theme')
    expect(result).toEqual({...child, parts: ['header'], templates: ['single']})
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
      'twentytwentyfive-loopress (child of twentytwentyfive, active)',
      '  1 template: single',
      '  1 part: header',
      '  Edited in the Site Editor: templates/single',
    ])
  })

  it('says so when the child does not exist yet', async () => {
    const {cmd, logs} = makeCmd({...child, customized: [], exists: false, parts: [], templates: []})

    await cmd.run()

    expect(logs.log.mock.calls.map(([line]) => line)).toEqual(['No Loopress child theme yet (twentytwentyfive-loopress), run lps theme template push.'])
  })
})
