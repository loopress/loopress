import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {authManager} from '../../src/config/auth.manager.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {resolveLinkedProject} from '../../src/lib/resolve-linked-project.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'

vi.mock('../../src/utils/loopress-config.js', () => ({readLocalConfig: vi.fn()}))

function fail(message: string): never {
  throw new Error(message)
}

describe('resolveLinkedProject', () => {
  beforeEach(() => {
    // Stubbing first lets unstubAllEnvs() restore a real LOOPRESS_TOKEN after the delete.
    vi.stubEnv('LOOPRESS_TOKEN', '')
    delete process.env.LOOPRESS_TOKEN
    vi.spyOn(authManager, 'getAuth').mockReturnValue({token: 'stored-token'} as never)
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue({apiProjectId: 'proj_1', name: 'Acme'} as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the linked cloud project id, the local config and the stored token', async () => {
    await expect(resolveLinkedProject(fail)).resolves.toEqual({
      apiProjectId: 'proj_1',
      localConfig: {projectId: 'acme'},
      token: 'stored-token',
    })
    expect(configManager.getProject).toHaveBeenCalledWith('acme')
  })

  it('prefers the LOOPRESS_TOKEN env var over the stored login', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')

    await expect(resolveLinkedProject(fail)).resolves.toMatchObject({token: 'env-token'})
  })

  it('falls back to the current project when loopress.json names none', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({})
    vi.mocked(configManager.getCurrentProject).mockReturnValue({id: 'current'} as never)

    await resolveLinkedProject(fail)

    expect(configManager.getProject).toHaveBeenCalledWith('current')
  })

  it('fails when not logged in', async () => {
    vi.mocked(authManager.getAuth).mockReturnValue(null)

    await expect(resolveLinkedProject(fail)).rejects.toThrow(/^Not logged in\. Run `lps login` first\.$/)
  })

  it('fails when no project is configured', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({})

    await expect(resolveLinkedProject(fail)).rejects.toThrow(
      /^No project configured\. Run `lps project config` first\.$/,
    )
  })

  it('fails when the configured project is unknown', async () => {
    vi.mocked(configManager.getProject).mockReturnValue(undefined as never)

    await expect(resolveLinkedProject(fail)).rejects.toThrow(
      'Project "acme" (from loopress.json) not found. Run `lps project config` to configure it.',
    )
  })

  it('fails when the project is not linked to the cloud account yet', async () => {
    vi.mocked(configManager.getProject).mockReturnValue({name: 'Acme'} as never)

    await expect(resolveLinkedProject(fail)).rejects.toThrow(
      'Project "Acme" is not linked to your Loopress account yet. Run `lps project push` first.',
    )
  })
})
