import {Args} from '@oclif/core'
import {Listr} from 'listr2'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {findOrphanedFiles, numericPrefixKey} from '../../lib/find-orphaned-files.js'
import {FORM_ENDPOINT, getFormId, getFormTitle} from '../../utils/form-format.js'
import {pluralize} from '../../utils/pluralize.js'
import {toSlug} from '../../utils/to-slug.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to forms directory (overrides project config)'}),
  }

  static description = 'Pull forms from WordPress'
  static examples = ['$ lps form pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveFormPath(args.path)

    this.log(`Pulling forms from ${url}`)
    this.log(`Forms path: ${path}`)

    const remoteList = await this.wp.get<Array<Record<string, unknown>>>(FORM_ENDPOINT)
    const withId = remoteList.filter((form) => getFormId(form) !== null)
    const skipped = remoteList.length - withId.length

    // Only matches files following the `<id>-<slug>.json` convention pull/push themselves
    // produce, same principle as `snippet pull`.
    const orphans = await findOrphanedFiles(path, new Set(withId.map((form) => String(getFormId(form)))), {
      extensions: ['.json'],
      key: numericPrefixKey,
    })

    if (this.dryRun) {
      this.log(`[dry-run] Would pull ${pluralize(withId.length, 'form')} to ${path}`)
      if (orphans.length > 0) {
        this.log(
          `[dry-run] Would remove ${pluralize(orphans.length, 'local file')} in ${path} no longer present on WordPress: ${orphans.join(', ')}`,
        )
      }

      return
    }

    if (withId.length > 0) await mkdir(path, {recursive: true})

    await new Listr(
      withId.map((form) => {
        const id = getFormId(form)!
        const title = getFormTitle(form)
        return {
          async task(_ctx, task) {
            await writeFile(join(path, `${id}-${toSlug(title, 'untitled')}.json`), JSON.stringify(form, null, 2) + '\n')
            task.output = `Pulled: ${title}`
          },
          title: `Pull ${title}`,
        }
      }),
    ).run()

    await this.removeOrphanedFiles(path, orphans, `in ${path} no longer present on WordPress`)

    this.log(`Pulled ${pluralize(withId.length, 'form')} to ${path}`)
    if (skipped > 0) {
      this.warn(`${pluralize(skipped, 'form')} skipped because they have no id`)
    }
  }
}
