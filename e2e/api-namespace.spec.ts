import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test} from './helpers/environment.js'

const ROUTE = [
  '<?php',
  '',
  'declare(strict_types=1);',
  '',
  'final class Hello',
  '{',
  "    public function get(WP_REST_Request $request): array",
  '    {',
  "        return ['ok' => true];",
  '    }',
  '}',
  '',
].join('\n')

test('api.namespace in loopress.json is pushed, diffed, validated and pulled', async ({projectDir, request, runCli, wp}) => {
  const auth = {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`}
  const namespace = async () => (await (await request.get(`${wp.url}/wp-json/loopress/v1/api-namespace`, {headers: auth})).json()).namespace
  const setConfig = (value: unknown) => writeFileSync(join(projectDir, 'loopress.json'), JSON.stringify({api: value}))

  mkdirSync(join(projectDir, 'api'), {recursive: true})
  writeFileSync(join(projectDir, 'api', 'hello.php'), ROUTE)

  // Refused before any write: the site keeps its namespace.
  const before = await namespace()
  setConfig({namespace: 'loopress/v1'})
  const refused = await runCli(['api', 'push'])
  expect(refused.exitCode).not.toBe(0)
  expect(refused.stderr).toContain('api.namespace')
  expect(await namespace()).toBe(before)
  expect((await runCli(['validate'])).exitCode).not.toBe(0)

  // Pushed before the routes: the route answers under the new namespace.
  setConfig({namespace: 'e2e-api/v2'})
  const pushed = await runCli(['api', 'push'])
  expect(pushed.exitCode, pushed.stderr).toBe(0)
  expect(await namespace()).toBe('e2e-api/v2')
  const route = await request.get(`${wp.url}/wp-json/e2e-api/v2/hello`, {headers: auth})
  expect(route.status()).toBe(200)

  // In sync, then drifting when loopress.json changes.
  expect((await runCli(['api', 'diff'])).exitCode).toBe(0)
  setConfig({namespace: 'e2e-other/v3'})
  const drift = await runCli(['api', 'diff'])
  expect(drift.exitCode).toBe(1)
  expect(drift.stdout).toContain('namespace')

  // Pull brings the site's value back.
  const pulled = await runCli(['api', 'pull'])
  expect(pulled.exitCode, pulled.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(projectDir, 'loopress.json'), 'utf8')).api.namespace).toBe('e2e-api/v2')

  // Leave the shared site as found.
  setConfig({namespace: 'loopress-api/v1'})
  expect((await runCli(['api', 'push'])).exitCode).toBe(0)
})
