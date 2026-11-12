import {confirm} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {guardProductionPush} from '../../src/lib/guard-production-push.js'

vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))

const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

class Refused extends Error {}

function run(options: {dryRun?: boolean; name?: string; type?: string; yes?: boolean}) {
  let refusals = 0
  const onRefuse = (): void => {
    refusals += 1
  }

  const error = vi.fn((message: string): never => {
    throw new Refused(message)
  })
  const done = guardProductionPush({
    dryRun: options.dryRun ?? false,
    error,
    onRefuse,
    siteConfig: {name: options.name ?? 'production', type: options.type ?? 'production', url: 'https://acme.com'},
    yes: options.yes ?? false,
  })
  return {done, refusals: () => refusals}
}

describe('guardProductionPush', () => {
  beforeEach(() => {
    interactive.value = false
    vi.mocked(confirm).mockReset()
  })

  it.each([
    ['a non-production environment', {name: 'staging', type: 'staging'}],
    ['an environment named production but of another type', {name: 'production', type: 'staging'}],
    ['a dry run', {dryRun: true}],
    ['--yes', {yes: true}],
  ])('lets %s through without asking', async (_label, options) => {
    interactive.value = true
    const {done, refusals} = run(options)

    await expect(done).resolves.toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
    expect(refusals()).toBe(0)
  })

  it('names the environment when it is not called production', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(true)
    await run({name: 'live'}).done

    expect(confirm).toHaveBeenCalledWith({default: true, message: 'Push to live (production) (https://acme.com)?'})
  })

  it('guards a production environment whatever its name', async () => {
    const {done} = run({name: 'live'})

    await expect(done).rejects.toThrow(Refused)
  })

  it('refuses outside a TTY with the exact hint, after notifying onRefuse', async () => {
    const {done, refusals} = run({})

    await expect(done).rejects.toThrow(
      'Target environment "production" is of type "production". Pass --yes to confirm the push in a non-interactive run.',
    )
    expect(refusals()).toBe(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks in a TTY, defaulting to yes, and proceeds when accepted', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(true)
    const {done, refusals} = run({})

    await expect(done).resolves.toBeUndefined()
    expect(confirm).toHaveBeenCalledWith({default: true, message: 'Push to production (https://acme.com)?'})
    expect(refusals()).toBe(0)
  })

  it('aborts in a TTY when declined, after notifying onRefuse', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const {done, refusals} = run({})

    await expect(done).rejects.toThrow(/^Aborted\.$/)
    expect(refusals()).toBe(1)
  })

  it('works without an onRefuse callback', async () => {
    await expect(
      guardProductionPush({
        dryRun: false,
        error(message) {
          throw new Refused(message)
        },
        siteConfig: {name: 'production', type: 'production', url: 'https://acme.com'},
        yes: false,
      }),
    ).rejects.toThrow(Refused)
  })
})
