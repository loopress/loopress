import {mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {basename, join, relative} from 'node:path'
import {crc32} from 'node:zlib'

import {expect, output, test} from './helpers/environment.js'
import {restDelete, restGet, restPost, uniqueSlug} from './helpers/rest.js'
import {setPluginActive} from './helpers/wp-admin.js'

// `lps eject` end to end: the ejected plugin must serve the same pages and REST answers as
// Loopress did, with Loopress deactivated. Uninstalling Loopress is not done here (every other
// spec needs it on this site); the ejected plugin reads nothing from wp-content/loopress/.

// A store-only zip, the format wp-admin's "Upload Plugin" accepts: no dependency for one archive.
function zipDirectory(dir: string, root: string): Buffer {
  const files: string[] = []
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(full)
    }
  }

  walk(dir)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(`${root}/${relative(dir, file).split('\\').join('/')}`)
    const data = readFileSync(file)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04_03_4b_50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02_01_4b_50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }

  const centralDirectory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06_05_4b_50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralDirectory, end])
}

function write(projectDir: string, path: string, content: string): void {
  mkdirSync(join(projectDir, path, '..'), {recursive: true})
  writeFileSync(join(projectDir, path), content)
}

test('the ejected plugin serves the same site once Loopress is deactivated', async ({page, projectDir, request, requestUtils, runCli, wp}) => {
  test.setTimeout(180_000)
  const type = uniqueSlug('ej')
  const tax = `${type}_cat`
  const role = `${type}_role`
  const pageSlug = `${type}-page`
  const hookFile = `${type}-hooks`
  const className = `Eject${type.replaceAll(/[^a-z0-9]/gu, '')}`

  write(projectDir, `cpt/${type}.json`, JSON.stringify({label: 'Ejected things', public: true, rewrite: {slug: type}, show_in_rest: true, supports: ['title', 'custom-fields']}))
  write(projectDir, `taxonomies/${tax}.json`, JSON.stringify({label: 'Ejected kinds', object_type: [type], public: true, show_in_rest: true}))
  write(projectDir, `meta/${type}.json`, JSON.stringify({weight: {show_in_rest: true, single: true, type: 'string'}}))
  write(projectDir, `roles/${role}.json`, JSON.stringify({capabilities: {edit_posts: true, read: true}, name: 'Ejected role'}))
  write(projectDir, `patterns/${type}.html`, `<!--\ntitle: Ejected pattern\n-->\n<!-- wp:paragraph -->\n<p>From the pattern</p>\n<!-- /wp:paragraph -->\n`)
  write(
    projectDir,
    `hooks/${hookFile}.php`,
    `<?php\ndeclare(strict_types=1);\n\nuse Loopress\\Hooks\\Attribute\\Action;\nuse Loopress\\Hooks\\Attribute\\Filter;\n\nfinal class ${className}\n{\n` +
      `    #[Action('init')]\n    public function shortcode(): void\n    {\n        add_shortcode('${type}_hello', static fn (): string => '<b>hello from a hook</b>');\n    }\n\n` +
      `    #[Filter('body_class', priority: 20)]\n    public function bodyClass(array $classes): array\n    {\n        $classes[] = '${type}-body';\n        return $classes;\n    }\n}\n`,
  )
  write(projectDir, `pages/${pageSlug}.html`, `<!--\ntitle: Ejected page\nstatus: publish\nhide-title: true\n-->\n<p>[${type}_hello]</p>\n<!-- wp:pattern {"slug":"loopress/${type}"} /-->\n`)

  const push = await runCli(['push', '--yes'])
  expect(push.exitCode, output(push)).toBe(0)

  const post = await restPost(request, wp, `wp/v2/${type}`, {meta: {weight: '400 g'}, status: 'publish', title: 'An ejected thing'})
  expect(post.ok(), await post.text()).toBe(true)
  const postId = ((await post.json()) as {id: number}).id
  const user = await restPost(request, wp, 'wp/v2/users', {email: `${role}@example.com`, password: `pw-${role}`, roles: [role], username: role})
  expect(user.ok(), await user.text()).toBe(true)
  const userId = ((await user.json()) as {id: number}).id

  const pageUrl = `${wp.url}/?pagename=${pageSlug}`
  const snapshot = async (): Promise<Record<string, string>> => ({
    page: await (await request.get(pageUrl)).text(),
    post: await (await request.get(`${wp.url}/wp-json/wp/v2/${type}/${postId}`)).text(),
    user: JSON.stringify(((await (await restGet(request, wp, `wp/v2/users/${userId}?context=edit`)).json()) as {capabilities: unknown}).capabilities),
  })
  const before = await snapshot()
  expect(before.page).toContain('<b>hello from a hook</b>')
  expect(before.page).toContain('From the pattern')
  expect(before.page).toContain(`${type}-body`)
  expect(before.post).toContain('400 g')

  const dryRun = await runCli(['eject', '--dry-run'])
  expect(dryRun.exitCode, output(dryRun)).toBe(0)
  expect(dryRun.stdout).toContain('Dry run, nothing written.')

  const eject = await runCli(['eject'])
  expect(eject.exitCode, output(eject)).toBe(0)
  const pluginSlug = basename(projectDir).toLowerCase()
  expect((await runCli(['eject'])).stderr).toContain('--force')

  const zipPath = join(projectDir, `${pluginSlug}.zip`)
  writeFileSync(zipPath, zipDirectory(join(projectDir, 'eject', pluginSlug), pluginSlug))
  await page.goto(`${wp.url}/wp-admin/plugin-install.php?tab=upload`)
  await page.setInputFiles('#pluginzip', zipPath)
  await page.click('#install-plugin-submit')
  await expect(page.locator('.wrap')).toContainText('Plugin installed successfully')
  const pluginFile = `${pluginSlug}/${pluginSlug}`
  expect((await restPost(request, wp, `wp/v2/plugins/${pluginFile}`, {status: 'active'})).ok()).toBe(true)

  try {
    // Both active: the ejected plugin stays idle, nothing is registered twice.
    expect(await snapshot()).toEqual(before)

    await setPluginActive(requestUtils, 'loopress-full', false)
    expect(await snapshot()).toEqual(before)
  } finally {
    await setPluginActive(requestUtils, 'loopress-full', true)
    await restPost(request, wp, `wp/v2/plugins/${pluginFile}`, {status: 'inactive'})
    await restDelete(request, wp, `wp/v2/plugins/${pluginFile}`)
    await restDelete(request, wp, `wp/v2/users/${userId}?force=true&reassign=1`)
    await restDelete(request, wp, `wp/v2/${type}/${postId}?force=true`)
    const pages = (await (await restGet(request, wp, `wp/v2/pages?slug=${pageSlug}&status=any`)).json()) as Array<{id: number}>
    for (const {id} of pages) await restDelete(request, wp, `wp/v2/pages/${id}?force=true`)
    for (const args of [['cpt', 'rm', type], ['taxonomy', 'rm', tax], ['meta', 'rm', type], ['role', 'rm', role], ['pattern', 'rm', type], ['hook', 'rm', hookFile]]) {
      await runCli([...args, '--yes'])
    }
  }
})

test('refuses, writing nothing, when the project uses a resource it cannot eject yet', async ({projectDir, runCli}) => {
  write(projectDir, 'api/orders.php', '<?php\n')

  const eject = await runCli(['eject'])
  expect(eject.exitCode).not.toBe(0)
  expect(eject.stderr).toContain('API routes (api/)')
  expect(() => statSync(join(projectDir, 'eject'))).toThrow()
})
