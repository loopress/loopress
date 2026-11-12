import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'

// rm, diff, rollback and the default prune for the two PHP-file resources (api/, hooks/), which share one
// command implementation (php-files-command.ts). Push/pull and syntax checks live in
// api-routes-sync.spec.ts and hook-push.spec.ts. Every class name is unique per run: a hooks/ file
// is require()d on every request, and a reused name could hit a stale OPcache copy.

type Kind = 'api' | 'hook'

const DIR: Record<Kind, string> = {api: 'api', hook: 'hooks'}

function source(kind: Kind, stamp: string, version: string): string {
  const className = `E2ePhp${kind === 'api' ? 'Api' : 'Hook'}${stamp}`
  return kind === 'api'
    ? [
        '<?php',
        '',
        'declare(strict_types=1);',
        '',
        'use Loopress\\Api\\Attribute\\Permission;',
        '',
        '#[Permission(public: true)]',
        `final class ${className}`,
        '{',
        '    public function get(): array',
        '    {',
        `        return ['version' => '${version}'];`,
        '    }',
        '}',
        '',
      ].join('\n')
    : [
        '<?php',
        '',
        'declare(strict_types=1);',
        '',
        'use Loopress\\Hooks\\Attribute\\Action;',
        '',
        `final class ${className}`,
        '{',
        "    #[Action('init')]",
        '    public function run(): void',
        '    {',
        `        // version ${version}`,
        '    }',
        '}',
        '',
      ].join('\n')
}

function writeFile(projectDir: string, kind: Kind, filename: string, content: string): string {
  const dir = join(projectDir, DIR[kind])
  mkdirSync(dir, {recursive: true})
  const file = join(dir, `${filename}.php`)
  writeFileSync(file, content)
  return file
}

function stampOf(): string {
  return `${Date.now()}${process.hrtime.bigint() % 1000n}`
}

for (const kind of ['api', 'hook'] as const) {
  test.describe(`lps ${kind}`, () => {
    test('rm removes one file from WordPress, refuses without --yes, and reports a file that is not there', async ({
      projectDir,
      runCli,
    }) => {
      const stamp = stampOf()
      const filename = `e2e-rm-${stamp}`
      writeFile(projectDir, kind, filename, source(kind, stamp, 'one'))
      expect((await runCli([kind, 'push'])).exitCode).toBe(0)

      const unconfirmed = await runCli([kind, 'rm', filename])
      expect(unconfirmed.exitCode).not.toBe(0)
      expect(output(unconfirmed)).toContain(`Removing ${filename} needs confirmation. Re-run with --yes.`)

      const dryRun = await runCli([kind, 'rm', filename, '--dry-run'])
      expect(dryRun.stdout).toContain(`[dry-run] Would remove ${filename}`)
      expect((await runCli([kind, 'list'])).stdout).toContain(filename)

      const rm = await runCli([kind, 'rm', filename, '--yes'])
      expect(rm.exitCode, output(rm)).toBe(0)
      expect(rm.stdout).toContain(`Removed ${filename}`)
      expect((await runCli([kind, 'list'])).stdout).not.toContain(filename)

      const again = await runCli([kind, 'rm', filename, '--yes'])
      expect(again.exitCode).not.toBe(0)
      expect(output(again)).toContain(`${filename} is not on`)
    })

    test('diff is in sync after a push + pull, then flags a local edit', async ({projectDir, runCli}) => {
      const stamp = stampOf()
      const filename = `e2e-diff-${stamp}`
      const file = writeFile(projectDir, kind, filename, source(kind, stamp, 'one'))
      expect((await runCli([kind, 'push'])).exitCode).toBe(0)
      expect((await runCli([kind, 'pull', '--yes'])).exitCode).toBe(0)

      const inSync = await runCli([kind, 'diff'])
      expect(inSync.exitCode, output(inSync)).toBe(0)
      expect(inSync.stdout).toContain('Everything is in sync')

      writeFileSync(file, source(kind, stamp, 'two'))
      const drifted = await runCli([kind, 'diff'])
      expect(drifted.exitCode).toBe(1)
      expect(drifted.stdout).toContain(filename)

      await runCli([kind, 'rm', filename, '--yes'])
    })

    test('rollback restores the file content from before the last push', async ({projectDir, runCli}) => {
      const stamp = stampOf()
      const filename = `e2e-rollback-${stamp}`
      const v1 = source(kind, stamp, 'one')
      const file = writeFile(projectDir, kind, filename, v1)
      expect((await runCli([kind, 'push'])).exitCode).toBe(0)
      writeFileSync(file, source(kind, stamp, 'two'))
      expect((await runCli([kind, 'push'])).exitCode).toBe(0)

      const rollback = await runCli([kind, 'rollback', '--yes'])
      expect(rollback.exitCode, output(rollback)).toBe(0)
      expect(rollback.stdout).toContain('Rolled back')

      rmSync(file)
      expect((await runCli([kind, 'pull', '--yes'])).exitCode).toBe(0)
      expect(readFileSync(file, 'utf8')).toBe(v1)

      await runCli([kind, 'rm', filename, '--yes'])
    })

    test('push prunes the server files absent locally by default: listed in --dry-run, kept with --no-prune, restored by rollback', async ({
      projectDir,
      runCli,
    }) => {
      const stamp = stampOf()
      const gone = `e2e-prune-gone-${stamp}`
      const kept = `e2e-prune-kept-${stamp}`
      const goneSource = source(kind, `${stamp}1`, 'one')
      const goneFile = writeFile(projectDir, kind, gone, goneSource)
      writeFile(projectDir, kind, kept, source(kind, `${stamp}2`, 'one'))
      expect((await runCli([kind, 'push'])).exitCode).toBe(0)
      rmSync(goneFile)

      const dryRun = await runCli([kind, 'push', '--dry-run'])
      expect(dryRun.exitCode, output(dryRun)).toBe(0)
      expect(output(dryRun)).toContain('[dry-run] Would prune')
      expect(output(dryRun)).toContain(gone)
      expect((await runCli([kind, 'list'])).stdout).toContain(gone)

      const noPrune = await runCli([kind, 'push', '--no-prune'])
      expect(noPrune.exitCode, output(noPrune)).toBe(0)
      expect((await runCli([kind, 'list'])).stdout).toContain(gone)

      const pruned = await runCli([kind, 'push'])
      expect(pruned.exitCode, output(pruned)).toBe(0)
      expect(output(pruned)).toContain(`Pruned: ${gone}`)
      const listed = (await runCli([kind, 'list'])).stdout
      expect(listed).not.toContain(gone)
      expect(listed).toContain(kept)

      const rollback = await runCli([kind, 'rollback', '--yes'])
      expect(rollback.exitCode, output(rollback)).toBe(0)
      const restored = (await runCli([kind, 'list'])).stdout
      expect(restored).toContain(gone)
      expect(restored).toContain(kept)

      await runCli([kind, 'rm', gone, '--yes'])
      await runCli([kind, 'rm', kept, '--yes'])
    })

    test('push refuses to prune when the local directory holds no PHP file, naming the path', async ({projectDir, runCli}) => {
      const stamp = stampOf()
      const filename = `e2e-prune-empty-${stamp}`
      const file = writeFile(projectDir, kind, filename, source(kind, stamp, 'one'))
      expect((await runCli([kind, 'push'])).exitCode).toBe(0)
      rmSync(file)

      const refused = await runCli([kind, 'push'])
      expect(refused.exitCode).not.toBe(0)
      expect(output(refused)).toContain('Refusing to prune')
      expect(output(refused)).toContain(DIR[kind])
      expect((await runCli([kind, 'list'])).stdout).toContain(filename)

      await runCli([kind, 'rm', filename, '--yes'])
    })
  })
}

test('api rm takes the route off the site, not just the file list', async ({projectDir, request, runCli, wp}) => {
  const stamp = stampOf()
  const filename = `e2e-live-rm-${stamp}`
  writeFile(projectDir, 'api', filename, source('api', stamp, 'live'))
  expect((await runCli(['api', 'push'])).exitCode).toBe(0)

  const live = await request.get(`${wp.url}/wp-json/loopress-api/v1/${filename}`)
  expect(live.status()).toBe(200)
  expect(await live.json()).toEqual({version: 'live'})

  expect((await runCli(['api', 'rm', filename, '--yes'])).exitCode).toBe(0)
  const gone = await request.get(`${wp.url}/wp-json/loopress-api/v1/${filename}`)
  expect(gone.status()).toBe(404)
})
