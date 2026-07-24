import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {readdir, readFile, rename} from 'node:fs/promises'
import {dirname, extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {FORM_ENDPOINT, getFormId, getFormTitle} from '../../utils/form-format.js'
import {slug} from './pull.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to forms directory (overrides project config)'}),
  }
  static description =
    'Push forms to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json` convention.'
  static examples = ['$ lps form push']
  static flags = {
    ...PushCommand.dryRunFlag,
  }
  private failedCount = 0

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveFormPath(args.path)

    this.log(`Pushing forms to ${url}`)
    this.log(`Forms path: ${path}`)

    const files = await this.loadFiles(path)
    this.log(`Found ${files.length} form${files.length === 1 ? '' : 's'} to push`)

    await new Listr(
      files.map(({data, filePath}) => ({
        task: async (_ctx, task) => this.pushForm(filePath, data, task),
        title: `Push ${getFormTitle(data)}`,
      })),
      {concurrent: false, exitOnError: false},
    ).run()

    if (this.failedCount > 0) {
      this.error(`${this.failedCount} form${this.failedCount === 1 ? '' : 's'} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All forms pushed.')
  }

  // Renames the local file to the `<id>-<slug>.json` convention used by `form pull`
  // whenever it doesn't already match (a hand-created file with no id, or a stale slug after
  // a title change in the WordPress admin), same principle as ensureCanonicalFilename in
  // commands/snippet/push.ts.
  private async ensureCanonicalFilename(filePath: string, id: number, title: string): Promise<void> {
    const canonicalPath = join(dirname(filePath), `${id}-${slug(title)}.json`)
    if (filePath !== canonicalPath) await rename(filePath, canonicalPath)
  }

  // One file is read in isolation: a corrupted or hand-broken JSON file must only skip that
  // form, not abort loading the rest of the directory, same principle as loadObjects() in
  // commands/acf/push.ts.
  private async loadFiles(dir: string): Promise<Array<{data: Record<string, unknown>; filePath: string}>> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    const forms: Array<{data: Record<string, unknown>; filePath: string}> = []
    for (const file of files) {
      if (extname(file) !== '.json') continue

      const filePath = join(dir, file)
      let parsed: unknown
      try {
        parsed = JSON.parse(await readFile(filePath, 'utf8'))
      } catch (error) {
        this.warn(`Skipping "${filePath}": ${(error as Error).message}`)
        continue
      }

      if (typeof parsed !== 'object' || parsed === null) {
        this.warn(`Skipping "${filePath}": not a JSON object`)
        continue
      }

      forms.push({data: parsed as Record<string, unknown>, filePath})
    }

    return forms
  }

  // Throwing on failure (rather than returning a boolean) is what lets Listr mark the task as
  // failed (red cross) instead of completed; `exitOnError: false` on the task list still lets
  // sibling forms push regardless. PUT-then-404-fallback-POST is the same dance as
  // commands/snippet/push.ts, forms are id-based like snippets, not key-based like ACF.
  private async pushForm(filePath: string, data: Record<string, unknown>, task?: {output: string}): Promise<void> {
    const title = getFormTitle(data)

    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${title}`
      return
    }

    try {
      const id = getFormId(data)

      if (id === null) {
        const created = await this.wp.post<Record<string, unknown>>(FORM_ENDPOINT, data)
        const newId = getFormId(created)
        if (newId !== null) await this.ensureCanonicalFilename(filePath, newId, title)
      } else {
        try {
          await this.wp.put(`${FORM_ENDPOINT}/${id}`, data)
          await this.ensureCanonicalFilename(filePath, id, title)
        } catch (error) {
          // The id recorded locally doesn't exist on this site (e.g. a fresh install): create
          // it instead of failing, and adopt whatever id the site assigns.
          if (!isNotFoundError(error)) throw error

          const created = await this.wp.post<Record<string, unknown>>(FORM_ENDPOINT, data)
          const newId = getFormId(created)
          if (newId !== null) await this.ensureCanonicalFilename(filePath, newId, title)
        }
      }

      if (task) task.output = `Pushed: ${title}`
    } catch (error) {
      const message = `Failed to push ${title}: ${(error as Error).message}`
      if (task) task.output = message
      else this.warn(`  ${message}`)

      this.failedCount++
      throw error
    }
  }
}
