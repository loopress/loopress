import {Args} from '@oclif/core'
import {readFile, rename} from 'node:fs/promises'
import {dirname, extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {putOrCreate} from '../../lib/put-or-create.js'
import {readdirTolerant} from '../../lib/readdir-tolerant.js'
import {FORM_ENDPOINT, getFormId, getFormTitle} from '../../utils/form-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {toSlug} from '../../utils/to-slug.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to forms directory (overrides project config)'}),
  }

  static description =
    'Push forms to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json` convention.'

  static examples = ['$ lps form push']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveFormPath(args.path)

    this.log(`Pushing forms to ${url}`)
    this.log(`Forms path: ${path}`)

    const files = await this.loadFiles(path)
    this.log(`Found ${pluralize(files.length, 'form')} to push`)

    await this.runPushTasks(
      files,
      ({data}) => getFormTitle(data),
      async ({data, filePath}, task) => this.pushForm(filePath, data, task),
    )

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'form')} failed to push.`)
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
    const canonicalPath = join(dirname(filePath), `${id}-${toSlug(title, 'untitled')}.json`)
    if (filePath !== canonicalPath) await rename(filePath, canonicalPath)
  }

  // One file is read in isolation: a corrupted or hand-broken JSON file must only skip that
  // form, not abort loading the rest of the directory, same principle as loadObjects() in
  // commands/acf/push.ts.
  private async loadFiles(dir: string): Promise<Array<{data: Record<string, unknown>; filePath: string}>> {
    const files = await readdirTolerant(dir)

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

  private async pushForm(filePath: string, data: Record<string, unknown>, task?: {output: string}): Promise<void> {
    const title = getFormTitle(data)

    if (this.dryRun) {
      if (task) task.output = `[dry-run] Would push: ${title}`
      return
    }

    try {
      const id = getFormId(data)
      const {body, created} = await putOrCreate<Record<string, unknown>>(this.wp, {
        id,
        payload: data,
        postEndpoint: FORM_ENDPOINT,
        putEndpoint: (formId) => `${FORM_ENDPOINT}/${formId}`,
      })

      const canonicalId = created ? getFormId(body) : id
      if (canonicalId !== null) await this.ensureCanonicalFilename(filePath, canonicalId, title)

      if (task) task.output = `Pushed: ${title}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${title}: ${(error as Error).message}`, error, task)
    }
  }
}
