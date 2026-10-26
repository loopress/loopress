import {beforeEach, describe, expect, it, vi} from 'vitest'

import Activate from '../../../src/commands/theme/activate.js'
import {type SiteCapabilities} from '../../../src/lib/capabilities.js'
import {makeCapabilities, stubCapabilities} from '../../helpers/capabilities.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

function make(argv: string[], capabilities: SiteCapabilities, options: {dryRun?: boolean; env?: string; yes?: boolean} = {}) {
  const cmd = new Activate(argv, fakeOclifConfig)
  const internals = cmd as unknown as {dryRun: boolean; localConfig: Record<string, unknown>; siteConfig: unknown; wpClient: unknown; yes: boolean}
  internals.siteConfig = makeEnv(options.env ?? 'local')
  internals.localConfig = {}
  internals.dryRun = options.dryRun ?? false
  internals.yes = options.yes ?? false
  const post = vi.fn(async (_path: string, body: {stylesheet: string}) => ({active: body.stylesheet, changed: true, previous: capabilities.theme.active}))
  internals.wpClient = {post}
  stubCapabilities(cmd, capabilities)
  const {log} = silenceLogs(cmd)
  return {cmd, log, post}
}

const pushedChild = makeCapabilities({theme: {child: {active: false, exists: true, stylesheet: 'twentytwentyfive-loopress'}}})

describe('theme activate', () => {
  beforeEach(() => {
    interactive.value = false
  })

  it('activates the Loopress child by default', async () => {
    const {cmd, log, post} = make([], pushedChild)

    const result = await cmd.run()

    expect(post).toHaveBeenCalledWith('loopress/v1/theme/activate', {stylesheet: 'twentytwentyfive-loopress'})
    expect(log).toHaveBeenCalledWith('Activated twentytwentyfive-loopress (was twentytwentyfive).')
    expect(result).toEqual({active: 'twentytwentyfive-loopress', previous: 'twentytwentyfive', status: 'activated'})
  })

  it('activates the theme it is given', async () => {
    const {cmd, post} = make(['astra'], pushedChild)

    await cmd.run()

    expect(post).toHaveBeenCalledWith('loopress/v1/theme/activate', {stylesheet: 'astra'})
  })

  it('does nothing when the theme is already active', async () => {
    const {cmd, post} = make(['twentytwentyfive'], pushedChild)

    expect(await cmd.run()).toEqual({active: 'twentytwentyfive', previous: 'twentytwentyfive', status: 'unchanged'})
    expect(post).not.toHaveBeenCalled()
  })

  it('changes nothing on a dry run', async () => {
    const {cmd, log, post} = make([], pushedChild, {dryRun: true})

    expect(await cmd.run()).toMatchObject({status: 'dry-run'})
    expect(log).toHaveBeenCalledWith('[dry-run] Would activate twentytwentyfive-loopress instead of twentytwentyfive.')
    expect(post).not.toHaveBeenCalled()
  })

  it('asks for the child to be pushed first', async () => {
    const {cmd} = make([], makeCapabilities())

    await expect(cmd.run()).rejects.toThrow('twentytwentyfive-loopress doesn\'t exist yet. Run `lps theme template push` first.')
  })

  it('explains why there can be no child on a classic theme or on Light', async () => {
    await expect(make([], makeCapabilities({theme: {active: 'astra', child: null}})).cmd.run()).rejects.toThrow(
      'The active theme "astra" can\'t have a Loopress child theme',
    )
    await expect(make([], makeCapabilities({theme: {child: undefined}})).cmd.run()).rejects.toThrow('needs Loopress Full')
  })

  it('needs --yes on production outside a TTY', async () => {
    const {cmd, post} = make([], pushedChild, {env: 'production'})

    await expect(cmd.run()).rejects.toThrow('Pass --yes')
    expect(post).not.toHaveBeenCalled()
  })
})
