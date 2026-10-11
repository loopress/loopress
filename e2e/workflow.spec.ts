/* eslint-disable camelcase -- register_post_type() arguments are snake_case. */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restDelete, restPut, uniqueSlug} from './helpers/rest.js'

// The project-wide commands (status, validate, pull, promote, --env): every other spec drives one
// resource at a time, these orchestrate several against the same environment config.

type Config = {
  currentProject: {id: string}
  projects: Record<string, {environments: Record<string, {addedAt: string; name: string; token: string; url: string}>; name: string}>
}

function configPath(homeDir: string): string {
  return join(homeDir, '.config', 'loopress', 'config.json')
}

// A second environment pointing at the same WordPress: enough to exercise --env and promote's
// pull-from-one, push-to-the-other orchestration without a second instance in CI.
function addEnvironment(homeDir: string, name: string): void {
  const config = JSON.parse(readFileSync(configPath(homeDir), 'utf8')) as Config
  const local = config.projects.e2e.environments.local
  config.projects.e2e.environments[name] = {...local, name}
  writeFileSync(configPath(homeDir), JSON.stringify(config, null, 2))
}


test.describe('lps status', () => {
  test('reports the project, the default environment and its URL', async ({runCli, wp}) => {
    const status = await runCli(['status'])

    expect(status.exitCode, output(status)).toBe(0)
    expect(status.stdout).toContain('Project:  e2e (local)')
    expect(status.stdout).toContain(`URL:      ${wp.url}`)

    const json = await runCli(['status', '--json'])
    expect(JSON.parse(json.stdout)).toMatchObject({environment: 'local', project: 'e2e (local)', url: wp.url})
  })

  test('--env reports the named environment, and an unknown one fails listing the available ones', async ({homeDir, runCli}) => {
    addEnvironment(homeDir, 'staging')

    const staging = await runCli(['status', '--env', 'staging'])
    expect(staging.exitCode, output(staging)).toBe(0)
    expect(staging.stdout).toContain('Project:  e2e (staging, via --env)')

    const unknown = await runCli(['status', '--env', 'nope'])
    expect(unknown.exitCode).not.toBe(0)
    expect(output(unknown)).toContain('Environment "nope" not found in project "e2e". Available: local, staging')
  })

  test('a loopress.json pinned to a project that no longer exists is reported, not crashed on', async ({projectDir, runCli}) => {
    writeFileSync(join(projectDir, 'loopress.json'), JSON.stringify({projectId: 'gone', rootDir: '.'}))

    const status = await runCli(['status', '--json'])

    expect(status.exitCode).toBe(0)
    expect((JSON.parse(status.stdout) as {note: string}).note).toContain('loopress.json pins project "gone"')
  })

  // Every other environment of the seeded project points at the same http:// site as "local":
  // resolving --env to it is proven by the CLI refusing to send its credentials in cleartext.
  test('a resource command run with --env targets that environment, and refuses plain HTTP for it', async ({homeDir, runCli}) => {
    addEnvironment(homeDir, 'staging')

    const list = await runCli(['cpt', 'list', '--env', 'staging'])
    expect(list.exitCode).not.toBe(0)
    expect(output(list)).toContain('Refusing to send credentials over plain HTTP for the "staging" environment')

    const unknown = await runCli(['cpt', 'list', '--env', 'nope'])
    expect(unknown.exitCode).not.toBe(0)
    expect(output(unknown)).toContain('Environment "nope" not found in project "e2e"')
  })
})

test.describe('lps validate', () => {
  test('a well-formed project passes, and --json reports how many files were checked', async ({projectDir, runCli}) => {
    mkdirSync(join(projectDir, 'cpt'), {recursive: true})
    writeFileSync(join(projectDir, 'cpt', 'e2e_ok.json'), JSON.stringify({public: true}))
    mkdirSync(join(projectDir, 'options'), {recursive: true})
    writeFileSync(join(projectDir, 'options', 'e2e_ok.json'), JSON.stringify({autoload: 'off', name: 'e2e_ok', value: 1}))

    const validate = await runCli(['validate'])
    expect(validate.exitCode, output(validate)).toBe(0)
    expect(validate.stdout).toContain('no problems found')

    const json = await runCli(['validate', '--json'])
    const result = JSON.parse(json.stdout) as {checked: number; problems: unknown[]; valid: boolean}
    expect(result).toMatchObject({problems: [], valid: true})
    expect(result.checked).toBeGreaterThanOrEqual(3)
  })

  test('collects every problem across resources in one run instead of stopping at the first', async ({projectDir, runCli}) => {
    mkdirSync(join(projectDir, 'cpt'), {recursive: true})
    writeFileSync(join(projectDir, 'cpt', 'Bad Slug.json'), JSON.stringify({public: true}))
    mkdirSync(join(projectDir, 'options'), {recursive: true})
    writeFileSync(join(projectDir, 'options', 'no_value.json'), JSON.stringify({autoload: 'off', name: 'no_value'}))
    mkdirSync(join(projectDir, 'hooks'), {recursive: true})
    writeFileSync(join(projectDir, 'hooks', 'empty.php'), '')
    writeFileSync(join(projectDir, 'composer.json'), '{ not json')
    writeFileSync(join(projectDir, 'loopress.json'), JSON.stringify({projectId: 'gone', rootDir: '.'}))

    const validate = await runCli(['validate', '--json'])

    expect(validate.exitCode).toBe(1)
    const {problems, valid} = JSON.parse(validate.stdout) as {problems: Array<{file: string; message: string}>; valid: boolean}
    expect(valid).toBe(false)
    const messages = problems.map((problem) => `${problem.file}: ${problem.message}`).join('\n')
    expect(messages).toContain('"Bad Slug" is not a valid post type slug')
    expect(messages).toContain('missing a "value" field')
    expect(messages).toContain('Hook file is empty')
    expect(messages).toContain('composer.json: not valid JSON')
    expect(messages).toContain('projectId "gone" is not a configured project')
  })

  test('never contacts WordPress: it passes with credentials that would be refused', async ({homeDir, projectDir, runCli}) => {
    const config = JSON.parse(readFileSync(configPath(homeDir), 'utf8')) as Config
    config.projects.e2e.environments.local.url = 'http://127.0.0.1:9'
    writeFileSync(configPath(homeDir), JSON.stringify(config))
    mkdirSync(join(projectDir, 'cpt'), {recursive: true})
    writeFileSync(join(projectDir, 'cpt', 'e2e_offline.json'), JSON.stringify({public: true}))

    const validate = await runCli(['validate'])

    expect(validate.exitCode, output(validate)).toBe(0)
  })
})

// A resource whose plugin isn't usable on this site fails on its own (the CI site has no form
// plugin, and both SEO plugins active at once), never stopping or hiding the others.
const PULL_FAILURES_ALLOWED: Record<string, string> = {
  SEO: 'Multiple SEO plugins are active at once',
  forms: 'No supported form plugin is active',
}

function pullFailures(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/✗ (.+?) failed: (.+?)(?= → | ✓ | › Error| Error:|$)/g)].map((match) => [match[1], match[2]]))
}

function expectOnlyAllowedFailures(text: string): void {
  for (const [label, reason] of Object.entries(pullFailures(text))) {
    expect(Object.keys(PULL_FAILURES_ALLOWED), `unexpected failure for ${label}: ${reason}`).toContain(label)
    expect(reason).toContain(PULL_FAILURES_ALLOWED[label])
  }
}

test.describe('lps pull', () => {
  test('pulls every resource in one run: a pushed post type and a tracked option land locally', async ({
    projectDir,
    request,
    runCli,
    wp,
  }) => {
    const slug = uniqueSlug('e2e')
    const option = `e2e_opt_pull_${Date.now()}`
    mkdirSync(join(projectDir, 'cpt'), {recursive: true})
    writeFileSync(join(projectDir, 'cpt', `${slug}.json`), JSON.stringify({labels: {name: 'E2E Aggregate'}, public: true}))
    expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
    expect((await restPut(request, wp, `loopress/v1/options/${option}`, {value: 'from WordPress'})).ok()).toBe(true)
    mkdirSync(join(projectDir, 'options'), {recursive: true})
    writeFileSync(join(projectDir, 'options', `${option}.json`), JSON.stringify({autoload: 'off', name: option, value: 'stale'}))

    try {
      const pull = await runCli(['pull', '--yes'])
      const text = output(pull)

      expectOnlyAllowedFailures(text)
      const failed = Object.keys(pullFailures(text))
      expect(pull.exitCode === 0).toBe(failed.length === 0)
      if (failed.length > 0) expect(text).toContain(`${failed.length} resource`)
      // Every resource ran, in order, whatever failed before it.
      const order = ['composer', 'plugins', 'post types', 'taxonomies', 'post meta', 'ACF', 'API routes', 'hooks', 'forms', 'SEO', 'menus', 'options', 'snippets']
      const positions = order.map((label) => text.indexOf(`→ Pulling ${label}...`))
      expect(positions.every((position) => position >= 0), text).toBe(true)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)

      expect(existsSync(join(projectDir, 'cpt', `${slug}.json`))).toBe(true)
      const pulledOption = JSON.parse(readFileSync(join(projectDir, 'options', `${option}.json`), 'utf8')) as {value: string}
      expect(pulledOption.value).toBe('from WordPress')
    } finally {
      await runCli(['cpt', 'rm', slug, '--yes'])
      await restDelete(request, wp, `loopress/v1/options/${option}`)
    }
  })

  test('--dry-run writes nothing locally', async ({projectDir, runCli}) => {
    const pull = await runCli(['pull', '--dry-run'])

    expectOnlyAllowedFailures(output(pull))
    expect(output(pull)).toContain('[dry-run]')
    for (const dir of ['cpt', 'taxonomies', 'meta', 'acf', 'api', 'hooks', 'menus', 'snippets']) {
      expect(existsSync(join(projectDir, dir)), `${dir}/ should not be created by a dry run`).toBe(false)
    }
  })
})

test.describe('lps promote', () => {
  test('refuses the same environment twice and an unknown one', async ({homeDir, runCli}) => {
    addEnvironment(homeDir, 'staging')

    const same = await runCli(['promote', 'local', 'local', '--yes'])
    expect(same.exitCode).not.toBe(0)
    expect(output(same)).toContain('<from> and <to> must be different environments.')

    const unknown = await runCli(['promote', 'local', 'nope', '--yes'])
    expect(unknown.exitCode).not.toBe(0)
    expect(output(unknown)).toContain('Environment "nope" not found in project "e2e". Available: local, staging')
  })

  test('without --yes, refuses to run non-interactively and touches nothing', async ({homeDir, projectDir, runCli}) => {
    addEnvironment(homeDir, 'staging')

    const promote = await runCli(['promote', 'local', 'staging'])

    expect(promote.exitCode).not.toBe(0)
    expect(output(promote)).toContain('Pass --yes to confirm.')
    expect(existsSync(join(projectDir, 'cpt'))).toBe(false)
  })

  // The seeded "staging" is http:// like "local", so the CLI refuses to pull from it: exactly the
  // partial-pull case promote must stop on before touching <to>.
  test('a pull from <from> that fails stops the promotion before anything is pushed to <to>', async ({
    homeDir,
    projectDir,
    runCli,
  }) => {
    addEnvironment(homeDir, 'staging')
    mkdirSync(join(projectDir, 'cpt'), {recursive: true})
    const file = join(projectDir, 'cpt', 'e2e_untouched.json')
    const content = JSON.stringify({public: true})
    writeFileSync(file, content)

    const promote = await runCli(['promote', 'staging', 'local', '--yes'])

    expect(promote.exitCode).not.toBe(0)
    expect(output(promote)).toContain('Pull from staging failed, local left untouched')
    expect(output(promote)).not.toContain('=== Pushing to local')
    expect(readFileSync(file, 'utf8')).toBe(content)
  })

  test('--dry-run refuses a resource directory outside the project, before pulling anything', async ({homeDir, projectDir, runCli}) => {
    addEnvironment(homeDir, 'staging')
    writeFileSync(join(projectDir, 'loopress.json'), JSON.stringify({cptDir: '../outside-cpt', rootDir: '.'}))

    const promote = await runCli(['promote', 'local', 'staging', '--dry-run'])

    expect(promote.exitCode).not.toBe(0)
    expect(output(promote)).toContain("--dry-run can't preview safely")
  })
})
