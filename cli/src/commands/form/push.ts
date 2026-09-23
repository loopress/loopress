import {Args, Flags} from '@oclif/core'
import {readFile, rename} from 'node:fs/promises'
import {dirname, extname, join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {putOrCreate} from '../../lib/put-or-create.js'
import {readdirTolerant} from '../../lib/readdir-tolerant.js'
import {getResourceStateProvider} from '../../lib/resource-state.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {FORM_ENDPOINT, formEndpoint, getFormId, getFormTitle, type RemoteForm} from '../../utils/form-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {toSlug} from '../../utils/to-slug.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to forms directory (overrides project config)'}),
  }

  static description =
    'Push forms to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json` convention.'

  static examples = ['$ lps form push', '$ lps form push --allow-notifications']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    'allow-notifications': Flags.boolean({
      default: false,
      description:
        "Also push each form's notification and confirmation settings (recipients, sender, messages). Off by default: the server keeps its own so a stray push can't redirect submissions.",
    }),
  }

  private allowNotifications = false

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {url} = this.siteConfig
    const path = this.resolveFormPath(args.path)
    this.allowNotifications = flags['allow-notifications']

    this.log(`Pushing forms to ${url}`)
    this.log(`Forms path: ${path}`)

    const provider = getResourceStateProvider('form')
    const beforeState = await this.captureBeforePushState(provider, path)

    const files = await this.loadFiles(path)
    this.log(`Found ${pluralize(files.length, 'form')} to push`)

    await this.runPushTasks(
      files,
      ({data}) => getFormTitle(data),
      async ({data, filePath}, task) => this.pushForm(filePath, data, task),
    )

    await this.writeAfterPushSnapshot(provider, path, beforeState)

    if (this.failedCount > 0) {
      this.error(`${pluralize(this.failedCount, 'form')} failed to push.`)
    }

    if (this.dryRun) return

    await this.recordSuccess()
    this.log('All forms pushed.')
  }

  private async currentRevision(id: number): Promise<string | undefined> {
    try {
      const current = await this.wp.get<RemoteForm>(formEndpoint(id))
      return current.revision
    } catch (error) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
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
      const payload = this.allowNotifications ? {...data, allowNotifications: true} : data

      // Read the form's current revision right before writing it, and send it back as
      // `expectedRevision`: WordPress refuses the write (412) if something else changed the
      // form in between, instead of this push silently overwriting it (#234). No revision to
      // condition on for a form that doesn't exist remotely yet (a first push, or one whose id
      // 404s below and falls back to create): that PUT attempt just 404s too, same as before
      // this existed. Kept out of the POST fallback body (`postPayload`): it is a precondition
      // on an existing resource, meaningless (and never persisted) on a freshly created one.
      const expectedRevision = id === null ? undefined : await this.currentRevision(id)
      const putPayload = expectedRevision === undefined ? payload : {...payload, expectedRevision}

      const {body, created} = await putOrCreate<Record<string, unknown>>(this.wp, {
        id,
        payload: putPayload,
        postEndpoint: FORM_ENDPOINT,
        postPayload: payload,
        putEndpoint: formEndpoint,
      })

      const canonicalId = created ? getFormId(body) : id
      if (canonicalId !== null) await this.ensureCanonicalFilename(filePath, canonicalId, title)

      if (task) task.output = `Pushed: ${title}`
    } catch (error) {
      this.reportTaskFailure(`Failed to push ${title}: ${(error as Error).message}`, error, task)
    }
  }
}
