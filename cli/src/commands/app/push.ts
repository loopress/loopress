import {Args} from '@oclif/core'
import {existsSync} from 'node:fs'
import {readdir, readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {
  APP_CONFIG_FILENAME,
  type AppFile,
  type AppManifest,
  diffFiles,
  loadAppManifest,
} from '../../lib/app-manifest.js'
import {PushCommand} from '../../lib/push-command.js'
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
  static args = {
    name: Args.string({description: 'Push only this app (defaults to every app in the directory)'}),
  }

  static description =
    'Push built single-page app bundles to WordPress. Each app is an `apps/<name>/` directory holding a loopress.app.json and a built dist/ folder. Only files whose content changed are uploaded.'

  static enableJsonFlag = true
  static examples = ['$ lps app push', '$ lps app push search']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveAppsPath()

    this.log(`Pushing apps to ${url}`)
    this.log(`Apps path: ${path}`)

    const dirNames = await this.appDirNames(path, args.name)
    this.log(`Found ${pluralize(dirNames.length, 'app')} to push`)

    const pushed: PushedApp[] = []

    await this.runPushTasks(
      dirNames,
      (dirName) => dirName,
      async (dirName, task) => {
        const result = await this.pushApp(join(path, dirName), dirName, task)
        if (result) pushed.push(result)
      },
    )

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
      entries = await readdir(path, {withFileTypes: true})
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.error(`Apps directory not found: ${path}. Create ${join(path, '<name>', APP_CONFIG_FILENAME)} first.`)
      }

      throw error
    }

    const names = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(path, name, APP_CONFIG_FILENAME)))
      .sort((a, b) => a.localeCompare(b))

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

  private async pushApp(appDir: string, dirName: string, task?: {output: string}): Promise<PushedApp | undefined> {
    let manifest: AppManifest
    let distDir: string
    try {
      ;({distDir, manifest} = await loadAppManifest(appDir, dirName))
    } catch (error) {
      this.reportTaskFailure(`${dirName}: ${(error as Error).message}`, error, task)
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

    try {
      await this.wp.post(`loopress/v1/apps/${manifest.name}/commit`, manifest)
    } catch (error) {
      this.reportTaskFailure(`${manifest.name}: commit failed: ${(error as Error).message}`, error, task)
    }

    if (task) {
      task.output =
        changed.length === 0
          ? `${manifest.name}: already up to date (build ${manifest.buildId})`
          : `${manifest.name}: uploaded ${pluralize(changed.length, 'file')}, committed build ${manifest.buildId}`
    }

    return {buildId: manifest.buildId, name: manifest.name, uploaded: changed.length}
  }

  private async remoteFiles(name: string): Promise<AppFile[]> {
    try {
      const remote = await this.wp.get<{files: AppFile[]}>(`loopress/v1/apps/${name}/manifest`)
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
      this.reportTaskFailure(`${name}: failed to upload ${file.path}: ${(error as Error).message}`, error)
    }
  }
}
