import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'

// How the CLI picks the environment it talks to (base.ts) and the
// local-only config commands (project list/switch, telemetry), against the real config file the
// CLI reads, not a mock.

type Env = {addedAt: string; name: string; token: string; url: string}
type Config = {
  currentProject: {id: string}
  projects: Record<string, {addedAt?: string; environments: Record<string, Env>; name: string}>
  telemetry?: {disabled: boolean}
}

function configPath(homeDir: string): string {
  return join(homeDir, '.config', 'loopress', 'config.json')
}

function readConfig(homeDir: string): Config {
  return JSON.parse(readFileSync(configPath(homeDir), 'utf8')) as Config
}

// Replaces the seeded "local" environment with the given names, all pointing at the e2e site.
function setEnvironments(homeDir: string, names: string[]): void {
  const config = readConfig(homeDir)
  const {local} = config.projects.e2e.environments
  config.projects.e2e.environments = Object.fromEntries(names.map((name) => [name, {...local, name}]))
  writeFileSync(configPath(homeDir), JSON.stringify(config))
}

test.describe('environment resolution', () => {
  test('without a "local" environment and several others, commands ask for --env instead of guessing', async ({homeDir, runCli}) => {
    setEnvironments(homeDir, ['staging', 'production'])

    const list = await runCli(['cpt', 'list'])
    expect(list.exitCode).not.toBe(0)
    expect(output(list)).toContain('Project "e2e" has no "local" environment, pass --env to pick one. Available: staging, production')

    // Resolved to staging, which the CLI then refuses to talk to over plain HTTP (the e2e site is http://).
    const withEnv = await runCli(['cpt', 'list', '--env', 'staging'])
    expect(output(withEnv)).toContain('Refusing to send credentials over plain HTTP for the "staging" environment')

    const status = await runCli(['status', '--json'])
    expect(JSON.parse(status.stdout)).toMatchObject({environments: ['staging', 'production'], project: 'e2e'})
  })

  test('a single non-local environment is the default, and plain HTTP is refused for it', async ({homeDir, runCli}) => {
    setEnvironments(homeDir, ['staging'])

    const list = await runCli(['cpt', 'list'])

    expect(list.exitCode).not.toBe(0)
    expect(output(list)).toContain('Refusing to send credentials over plain HTTP for the "staging" environment')
    expect(output(list)).toContain('Plain HTTP is allowed only for the "local" environment')
  })

  test('loopress.json pinning a project that is not configured fails clearly', async ({projectDir, runCli}) => {
    writeFileSync(join(projectDir, 'loopress.json'), JSON.stringify({projectId: 'not-configured', rootDir: '.'}))

    const list = await runCli(['cpt', 'list'])

    expect(list.exitCode).not.toBe(0)
    expect(output(list)).toContain('Project "not-configured" (from loopress.json) not found')
  })

  test('wrong credentials surface as an authentication error, not a crash', async ({homeDir, runCli}) => {
    const config = readConfig(homeDir)
    config.projects.e2e.environments.local.token = 'admin:not-a-real-app-password'
    writeFileSync(configPath(homeDir), JSON.stringify(config))

    const list = await runCli(['option', 'add', 'blogname'])

    expect(list.exitCode).not.toBe(0)
    expect(output(list)).not.toContain('TypeError')
    expect(output(list)).toMatch(/401|credentials|application password/i)
  })
})

test.describe('local config commands', () => {
  test('project list shows the project and its default environment, never the token', async ({homeDir, runCli, wp}) => {
    setEnvironments(homeDir, ['local', 'staging'])

    const list = await runCli(['project', 'list', '--json'])

    expect(list.exitCode, output(list)).toBe(0)
    expect(list.stdout).not.toContain(wp.appPassword)
    expect(JSON.parse(list.stdout)).toEqual([
      {
        environments: [
          {isDefault: true, name: 'local', url: wp.url},
          {isDefault: false, name: 'staging', url: wp.url},
        ],
        id: 'e2e',
        isCurrent: true,
        name: 'e2e',
      },
    ])
  })

  test('project switch with a single project selects it without prompting', async ({homeDir, runCli}) => {
    const config = readConfig(homeDir)
    config.currentProject = {id: 'nothing'}
    writeFileSync(configPath(homeDir), JSON.stringify(config))

    const switched = await runCli(['project', 'switch'])

    expect(switched.exitCode, output(switched)).toBe(0)
    expect(switched.stdout).toContain('Switched to "e2e"')
    expect(readConfig(homeDir).currentProject.id).toBe('e2e')
  })

  test('telemetry enable / disable flip the setting and are idempotent', async ({homeDir, runCli}) => {
    const disabledAgain = await runCli(['telemetry', 'disable'])
    expect(disabledAgain.stdout).toContain('Error reporting is already disabled.')

    const enabled = await runCli(['telemetry', 'enable'])
    expect(enabled.stdout).toContain('Error reporting enabled.')
    expect(readConfig(homeDir).telemetry).toEqual({disabled: false})

    const enabledAgain = await runCli(['telemetry', 'enable'])
    expect(enabledAgain.stdout).toContain('Error reporting is already enabled.')

    const disabled = await runCli(['telemetry', 'disable'])
    expect(disabled.stdout).toContain('Error reporting disabled.')
    expect(readConfig(homeDir).telemetry).toEqual({disabled: true})
  })
})
