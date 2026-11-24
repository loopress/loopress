import {Command, Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {mkdir, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, join, resolve} from 'node:path'

import {planEject} from '../lib/eject.js'
import {readLocalConfig} from '../utils/loopress-config.js'
import {toSlug} from '../utils/to-slug.js'

export default class Eject extends Command {
  static override description =
    'Turn this project into one standard WordPress plugin, so the site works the same without Loopress. Reads the repo only, never the site'

  static override examples = ['$ lps eject', '$ lps eject --dry-run', '$ lps eject --out ../my-site-plugin --force']

  static override flags = {
    'dry-run': Flags.boolean({default: false, description: 'List what would be generated, write nothing'}),
    force: Flags.boolean({default: false, description: 'Replace the output folder when it already exists'}),
    out: Flags.string({description: 'Output folder (default: eject/<project-slug>)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Eject)
    const cwd = process.cwd()
    const slug = toSlug(basename(cwd), 'site')
    const plan = await planEject(cwd, await readLocalConfig(), slug)

    if (plan.unsupported.length > 0) {
      this.error(
        `Nothing was written: lps eject cannot turn these into plain WordPress code yet.\n  ${plan.unsupported.join('\n  ')}\n` +
          'See https://docs.loopress.dev/cli/eject/ for what is supported.',
      )
    }

    const out = resolve(cwd, flags.out ?? join('eject', slug))
    this.log(`Plugin "${slug}" in ${out}`)
    for (const line of plan.generated) this.log(`  ${line}`)
    if (plan.generated.length === 0) this.log('  nothing runs through Loopress at runtime: the plugin is empty')

    if (flags['dry-run']) {
      for (const file of plan.files) this.log(`  + ${file.path}`)
      this.log('Dry run, nothing written.')
      return
    }

    if (existsSync(out)) {
      if (!flags.force) this.error(`${out} already exists. Pass --force to replace it.`)
      await rm(out, {force: true, recursive: true})
    }

    for (const file of plan.files) {
      const path = join(out, file.path)
      await mkdir(dirname(path), {recursive: true})
      await writeFile(path, file.content, 'utf8')
    }

    this.log(`${plan.files.length} file(s) written. Nothing changed on any site. To switch:`)
    for (const note of plan.notes) this.log(`  0. ${note}`)
    this.log(`  1. Install ${slug}/ on the site and activate it (it stays idle while Loopress is active).`)
    this.log('  2. Deactivate Loopress, then check the site.')
    this.log('  3. Uninstall Loopress (it deletes wp-content/loopress/, which nothing uses anymore).')
  }
}
