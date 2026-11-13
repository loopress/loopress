import {Args, Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {readdir, readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {buildApp} from '../../lib/app-build.js'
import {
  APP_CONFIG_FILENAME,
  type AppFile,
  type AppManifest,
  diffFiles,
  loadAppManifest,
} from '../../lib/app-manifest.js'
import {APP_RESOURCE, APP_SNAPSHOT_MAX_BYTES, type AppBundles, appSnapshotPayload, appsState, readBundle} from '../../lib/app-snapshot.js'
import {type ResourceState} from '../../lib/diff-state.js'
import {withoutExcluded} from '../../lib/exclude.js'
import {errorCode, errorMessage} from '../../lib/narrow.js'
import {PushCommand} from '../../lib/push-command.js'
import {writeSnapshot} from '../../lib/snapshot-store.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {pluralize} from '../../utils/pluralize.js'

type PushedApp = {
  buildId: string
  name: string
  uploaded: number
}

type PushResult = {
  pushed: PushedApp[]
  status: 'dry-run' | 'success'
}

export default class Push extends PushCommand {
  static override args = {
    name: Args.string({description: 'Push only this app (defaults to every app in the directory)'}),
  }

  static override description =
    'Build and push single-page app bundles to WordPress. Each app is an `apps/<name>/` directory holding a loopress.app.json and a dist/ folder. When the app has a package.json with a `build` script, it runs first (use --no-build to skip it). Only files whose content changed are uploaded.'

  static override enableJsonFlag = true

  static override examples = ['$ lps app push', '$ lps app push search', '$ lps app push --no-build']
  static override flags = {
    build: Flags.boolean({
      allowNo: true,
      default: true,
      description: "Run the app's package.json build script before pushing",
    }),
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  private build = true
  // What this push sent, for `lps app rollback` (see writeAppSnapshot).
  private pushedBundles: AppBundles = {}

  async run(): Promise<PushResult> {
    const {args, flags} = await this.parse(Push)
    this.build = flags.build
    const {url} = this.siteConfig
    const path = this.resolveAppsPath()

    this.log(`Pushing apps to ${url}`)
    this.log(`Apps path: ${path}`)

    const dirNames = await this.appDirNames(path, args.name)
    this.log(`Found ${pluralize(dirNames.length, 'app')} to push`)

    const pushed: PushedApp[] = []
    const beforeState = this.dryRun ? undefined : await this.readBeforeState()

    await this.runPushTasks(
      dirNames,
      (dirName) => dirName,
      async (dirName, task) => {
        const result = await this.pushApp(join(path, dirName), dirName, task)
        if (result) pushed.push(result)
      },
    )

    if (beforeState) await this.writeAppSnapshot(beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'app')} failed to push.`)
    }

    if (this.dryRun) return {pushed, status: 'dry-run'}

    await this.recordSuccess()
    this.log('All apps pushed.')
    return {pushed, status: 'success'}
  }

  private async appDirNames(path: string, only?: string): Promise<string[]> {
    let entries
    try {
      entries = withoutExcluded(path, await readdir(path, {withFileTypes: true}), (entry) => entry.name)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        this.error(`Apps directory not found: ${path}. Create ${join(path, '<name>', APP_CONFIG_FILENAME)} first.`)
      }

      throw error
    }

    const names = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(path, name, APP_CONFIG_FILENAME)))
      .toSorted((a, b) => a.localeCompare(b))

    if (only) {
      if (!names.includes(only)) {
        this.error(`No app "${only}" in ${path} (looked for ${join(only, APP_CONFIG_FILENAME)}).`)
      }

      return [only]
    }

    if (names.length === 0) {
      this.error(`No apps found in ${path}. Each app needs a ${APP_CONFIG_FILENAME} and a built dist/ folder.`)
    }

    return names
  }

  private async keepBundle(distDir: string, manifest: AppManifest): Promise<void> {
    try {
      this.pushedBundles[manifest.name] = {after: await readBundle(distDir, manifest)}
    } catch (error) {
      this.warn(`${manifest.name}: could not keep a copy of the bundle for \`lps app rollback\`: ${errorMessage(error)}`)
    }
  }

  private async pushApp(appDir: string, dirName: string, task?: {output: string}): Promise<PushedApp | undefined> {
    let manifest: AppManifest
    let distDir: string
    try {
      // Built on dry runs too: the preview diffs dist/, so a stale one would make it lie.
      if (this.build) {
        await buildApp(appDir, (command) => {
          if (task) task.output = `${dirName}: building (${command})`
        })
      }

      ;({distDir, manifest} = await loadAppManifest(appDir, dirName))
    } catch (error) {
      this.reportTaskFailure(`${dirName}: ${errorMessage(error)}`, error, task)
    }

    const remote = await this.remoteFiles(manifest.name)
    const changed = diffFiles(manifest.files, remote)

    if (this.dryRun) {
      if (task) {
        task.output =
          changed.length === 0
            ? `[dry-run] ${manifest.name}: up to date (build ${manifest.buildId})`
            : `[dry-run] ${manifest.name}: would upload ${pluralize(changed.length, 'file')}, then commit build ${manifest.buildId}`
      }

      return undefined
    }

    for (const [index, file] of changed.entries()) {
      if (task) task.output = `${manifest.name}: uploading ${file.path} (${index + 1}/${changed.length})`
      await this.uploadAsset(manifest.name, distDir, file)
    }

    let committed: {crossOrigin?: null | string}
    try {
      committed = await this.wp.post(`loopress/v1/apps/${manifest.name}/commit`, manifest)
    } catch (error) {
      this.reportTaskFailure(`${manifest.name}: commit failed: ${errorMessage(error)}`, error, task)
    }

    this.warnIfCrossOriginIgnored(manifest, committed)
    await this.keepBundle(distDir, manifest)

    if (task) {
      task.output =
        changed.length === 0
          ? `${manifest.name}: already up to date (build ${manifest.buildId})`
          : `${manifest.name}: uploaded ${pluralize(changed.length, 'file')}, committed build ${manifest.buildId}`
    }

    return {buildId: manifest.buildId, name: manifest.name, uploaded: changed.length}
  }

  // The apps on the site before this push, the state `lps app rollback` restores. A site that
  // cannot list them only costs the snapshot, never the push.
  private async readBeforeState(): Promise<ResourceState | undefined> {
    try {
      return await appsState(this.wp)
    } catch (error) {
      this.warn(`Could not read the apps on the site, this push saves no rollback snapshot: ${errorMessage(error)}`)
      return undefined
    }
  }

  private async remoteFiles(name: string): Promise<AppFile[]> {
    try {
      const remote = await this.wp.get<{files?: AppFile[]}>(`loopress/v1/apps/${name}/manifest`)
      return remote.files ?? []
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }
  }

  private async uploadAsset(name: string, distDir: string, file: AppFile): Promise<void> {
    const content = (await readFile(join(distDir, file.path))).toString('base64')
    try {
      await this.wp.put(`loopress/v1/apps/${name}/assets`, {content, encoding: 'base64', path: file.path})
    } catch (error) {
      this.reportTaskFailure(`${name}: failed to upload ${file.path}: ${errorMessage(error)}`, error)
    }
  }

  // An older plugin, or an app .htaccess the site owner manages, commits the build without the
  // policy: say so rather than let the app look protected when it is not.
  private warnIfCrossOriginIgnored(manifest: AppManifest, committed?: {crossOrigin?: null | string}): void {
    if (manifest.crossOrigin && committed?.crossOrigin !== manifest.crossOrigin) {
      this.warn(
        `${manifest.name}: crossOrigin "${manifest.crossOrigin}" was not applied: either the Loopress plugin on this site is too old (update it, then push again) or wp-content/loopress/apps/${manifest.name}/.htaccess is managed by hand and was left untouched.`,
      )
    }
  }

  // `lps app rollback`'s restore point. The site cannot give a bundle back (a commit overwrites
  // same-path files), so the snapshot keeps the bundles this push sent and, when an earlier
  // snapshot has it, the one the site had before (see appSnapshotPayload).
  private async writeAppSnapshot(beforeState: ResourceState): Promise<void> {
    if (Object.keys(this.pushedBundles).length === 0) return

    try {
      const rootDir = resolve(process.cwd(), this.rootDir)
      const environment = this.siteConfig.name
      const {bytes, payload} = await appSnapshotPayload({beforeState, environment, pushed: this.pushedBundles, rootDir})
      if (!payload) {
        const mb = (size: number) => `${(size / 1024 / 1024).toFixed(1)} MB`
        this.warn(
          `No rollback snapshot saved for this push: its bundles take ${mb(bytes)}, above the ${mb(APP_SNAPSHOT_MAX_BYTES)} a snapshot keeps. ` +
            'Undo it by checking out the previous build in Git and pushing again.',
        )
        return
      }

      await writeSnapshot({afterState: await appsState(this.wp), beforeState, environment, payload, resource: APP_RESOURCE, rootDir})
    } catch (error) {
      this.warn(`Could not save a rollback snapshot after this push: ${errorMessage(error)}`)
    }
  }
}
