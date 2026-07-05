import {confirm, input, password as passwordPrompt, select} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Config from '../../../src/commands/project/config.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}))

function make(): Config {
  return new Config([], fakeOclifConfig)
}

function callByMessage(mockFn: {mock: {calls: unknown[][]}}, message: string): Record<string, unknown> {
  const call = mockFn.mock.calls.find((args) => (args[0] as {message?: string}).message === message)
  if (!call) throw new Error(`no call found with message "${message}"`)
  return call[0] as Record<string, unknown>
}

describe('project config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a brand new project when none exist yet', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    const createProjectId = vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    const setProject = vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(input)
      .mockResolvedValueOnce('  mon site  ') // project name (untrimmed)
      .mockResolvedValueOnce('https://example.com') // url
      .mockResolvedValueOnce('admin') // username
    vi.mocked(select).mockResolvedValueOnce('production') // environment choice
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(setProject).toHaveBeenCalledWith('new-id', {
      addedAt: expect.any(String),
      environments: {
        production: {
          addedAt: expect.any(String),
          name: 'production',
          token: 'admin:secret',
          url: 'https://example.com',
        },
      },
      name: 'mon site',
    })
    expect(createProjectId).toHaveBeenCalledWith('mon site')
    expect(log).toHaveBeenCalledWith('✓ "mon site/production" configured')
  })

  it('adds a new environment to an existing project without a confirmation prompt', async () => {
    const existingProject = makeListedProject('id-acme', 'acme', {production: makeEnv('production')})
    vi.spyOn(configManager, 'listProjects').mockReturnValue([existingProject])
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(existingProject)
    const setEnvironment = vi.spyOn(configManager, 'setEnvironment').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('staging')
    vi.mocked(input).mockResolvedValueOnce('https://staging.acme.com').mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(confirm).not.toHaveBeenCalled()
    expect(setEnvironment).toHaveBeenCalledWith('id-acme', 'staging', {
      addedAt: expect.any(String),
      name: 'staging',
      token: 'admin:secret',
      url: 'https://staging.acme.com',
    })
    expect(log).toHaveBeenCalledWith('✓ "acme/staging" configured')
  })

  it('aborts without writing when the user declines to overwrite an existing environment', async () => {
    const existingProject = makeListedProject('id-acme', 'acme', {production: makeEnv('production')})
    vi.spyOn(configManager, 'listProjects').mockReturnValue([existingProject])
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(makeEnv('production'))
    const setEnvironment = vi.spyOn(configManager, 'setEnvironment').mockImplementation(() => {})
    const setProject = vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('production')
    vi.mocked(confirm).mockResolvedValueOnce(false)

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('Aborted.')
    expect(input).not.toHaveBeenCalled()
    expect(setEnvironment).not.toHaveBeenCalled()
    expect(setProject).not.toHaveBeenCalled()
  })

  it('overwrites an existing environment when the user confirms', async () => {
    const existingProject = makeListedProject('id-acme', 'acme', {production: makeEnv('production')})
    vi.spyOn(configManager, 'listProjects').mockReturnValue([existingProject])
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(makeEnv('production'))
    vi.spyOn(configManager, 'getProject').mockReturnValue(existingProject)
    const setEnvironment = vi.spyOn(configManager, 'setEnvironment').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('production')
    vi.mocked(confirm).mockResolvedValueOnce(true)
    vi.mocked(input).mockResolvedValueOnce('https://new-url.acme.com').mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(setEnvironment).toHaveBeenCalledWith(
      'id-acme',
      'production',
      expect.objectContaining({url: 'https://new-url.acme.com'}),
    )
  })

  it('prompts for a custom environment name when "Custom…" is chosen', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('__custom__')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('qa')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(callByMessage(input, 'Environment name')).toBeDefined()
  })

  it('rejects a duplicate (case-insensitive) or empty project name when creating a new project', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', '  Acme  ', {})])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce(('__new__') as never).mockResolvedValueOnce('production')
    vi.mocked(input)
      .mockResolvedValueOnce('beta')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const {validate} = callByMessage(input, 'Project name') as {validate: (value: string) => string | true}
    expect(validate('')).toBe('Name cannot be empty')
    expect(validate('   ')).toBe('Name cannot be empty')
    expect(validate('acme')).toBe('A project named "acme" already exists')
    expect(validate('ACME')).toBe('A project named "ACME" already exists')
    expect(validate('beta')).toBe(true)
  })

  it('prompts for the environment choice with the expected options', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('production')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'local', value: 'local'},
        {name: 'staging', value: 'staging'},
        {name: 'production', value: 'production'},
        {name: 'Custom…', value: '__custom__'},
      ],
      message: 'Environment',
    })
  })

  it('rejects an empty custom environment name', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('__custom__')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('qa')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const {validate} = callByMessage(input, 'Environment name') as {validate: (value: string) => string | true}
    expect(validate('   ')).toBe('Name cannot be empty')
    expect(validate('qa')).toBe(true)
  })

  it('prompts to overwrite with the project/env name and a false default', async () => {
    const existingProject = makeListedProject('id-acme', 'acme', {production: makeEnv('production')})
    vi.spyOn(configManager, 'listProjects').mockReturnValue([existingProject])
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(makeEnv('production'))
    vi.spyOn(configManager, 'setEnvironment').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('production')
    vi.mocked(confirm).mockResolvedValueOnce(false)

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(confirm).toHaveBeenCalledWith({default: false, message: '"acme/production" already exists. Overwrite?'})
  })

  it('accepts an http:// URL', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('production')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('http://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const {validate} = callByMessage(input, 'WordPress URL') as {validate: (value: string) => string | true}
    expect(validate('http://example.com')).toBe(true)
  })

  it('prompts for username and application password with the expected shape', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('production')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const usernameCall = callByMessage(input, 'Username') as {validate: (value: string) => string | true}
    expect(usernameCall.validate('   ')).toBe('Username cannot be empty')
    expect(usernameCall.validate('admin')).toBe(true)

    expect(passwordPrompt).toHaveBeenCalledWith({
      mask: '*',
      message: 'Application password',
      validate: expect.any(Function),
    })
    const passwordCall = vi.mocked(passwordPrompt).mock.calls[0][0] as {validate: (value: string) => string | true}
    expect(passwordCall.validate('   ')).toBe('Application password cannot be empty')
    expect(passwordCall.validate('secret')).toBe(true)
  })

  it('logs the follow-up hint after configuring', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('production')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('→ Run `lps project switch` to change the active project or environment')
  })

  it('offers existing projects plus "Add a new project…" and selects the chosen one', async () => {
    const acme = makeListedProject('id-acme', 'acme', {})
    const beta = makeListedProject('id-beta', 'beta', {})
    vi.spyOn(configManager, 'listProjects').mockReturnValue([acme, beta])
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(beta)
    const setEnvironment = vi.spyOn(configManager, 'setEnvironment').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('id-beta').mockResolvedValueOnce('production')
    vi.mocked(input).mockResolvedValueOnce('https://beta.com').mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'acme', value: 'id-acme'},
        {name: 'beta', value: 'id-beta'},
        {name: 'Add a new project…', value: '__new__'},
      ],
      message: 'Project',
    })
    expect(setEnvironment).toHaveBeenCalledWith('id-beta', 'production', expect.anything())
    expect(log).toHaveBeenCalledWith('✓ "beta/production" configured')
  })

  it('validates the WordPress URL format', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'createProjectId').mockReturnValue('new-id')
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)
    vi.spyOn(configManager, 'setProject').mockImplementation(() => {})

    vi.mocked(select).mockResolvedValueOnce('production')
    vi.mocked(input)
      .mockResolvedValueOnce('mon site')
      .mockResolvedValueOnce('https://example.com')
      .mockResolvedValueOnce('admin')
    vi.mocked(passwordPrompt).mockResolvedValueOnce('secret')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const {validate} = callByMessage(input, 'WordPress URL') as {validate: (value: string) => string | true}
    expect(validate('not a url')).toBe('Invalid URL')
    expect(validate('ftp://example.com')).toBe('URL must start with http:// or https://')
    expect(validate('https://example.com')).toBe(true)
  })
})
