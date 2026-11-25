import {expect, test} from './helpers/environment.js'

// A pull brings the project to the site's state: the diff right after it has nothing to report.
test('lps pull then lps diff reports everything in sync', async ({runCli}) => {
  const pull = await runCli(['pull'])
  expect(pull.exitCode, pull.stdout + pull.stderr).toBe(0)

  const diff = await runCli(['diff'])
  expect(diff.exitCode, diff.stdout + diff.stderr).toBe(0)
  expect(diff.stdout).toContain('Everything is in sync')
})
