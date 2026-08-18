import {Args} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {findOrphanedFiles, numericPrefixKey} from '../../lib/find-orphaned-files.js'
import {pluralize} from '../../utils/pluralize.js'
import {buildMetaFile, buildSnippetFile, normalizeSnippet, SNIPPETS_ENDPOINT, type SnippetType} from '../../utils/snippet-format.js'
import {toSlug} from '../../utils/to-slug.js'

const EXTENSIONS: Record<SnippetType, string> = {
  css: 'css',
  html: 'html',
  js: 'js',
  php: 'php',
  text: 'txt',
}

type PulledSnippet = {
  id: number
  name: string
}

type PullResult = {
  orphans: string[]
  pulled: PulledSnippet[]
  skipped: number
  status: 'dry-run' | 'success'
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to snippets directory (overrides project config)'}),
  }

  static description = 'Pull snippets from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps snippet pull', '$ lps snippet pull --path ./snippets']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<PullResult> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const path = this.resolveSnippetsPath(args.path)

    this.log(`Pulling snippets from ${url}`)
    this.log(`Snippets path: ${path}`)

    const remoteList = await this.wp.get<Array<Record<string, unknown>>>(SNIPPETS_ENDPOINT)
    const snippets = remoteList.map((r) => normalizeSnippet(r))
    const pullable = snippets.filter((snippet) => snippet.name.trim())
    const skipped = snippets.length - pullable.length

    // Files following the `<id>-<slug>` convention whose id is no longer in the current
    // remote list belong to a snippet that was deleted on WordPress. Left on disk, they'd
    // silently come back to life the next time `snippet push` runs.
    const orphans = await findOrphanedFiles(path, new Set(pullable.map((snippet) => String(snippet.id))), {
      extensions: ['.json', ...Object.values(EXTENSIONS).map((ext) => `.${ext}`)],
      key: numericPrefixKey,
    })

    const pulled = pullable.map((snippet) => ({id: snippet.id, name: snippet.name}))

    await this.pullDirectory(path, pullable, orphans, {
      alwaysCreateDir: true,
      dryRunMessage: `Would pull ${pluralize(snippets.length, 'snippet')} to ${path}`,
      orphanReason: 'whose snippet no longer exists on WordPress',
      pulledMessage: `Pulled ${pluralize(pullable.length, 'snippet')} to ${path}`,
      title: (snippet) => snippet.name,
      async write(snippet, writeDir) {
        const ext = EXTENSIONS[snippet.type]
        const base = `${snippet.id}-${toSlug(snippet.name)}`
        await writeFile(join(writeDir, `${base}.${ext}`), buildSnippetFile(snippet))
        await writeFile(join(writeDir, `${base}.json`), buildMetaFile(snippet))
      },
    })

    if (this.dryRun) return {orphans, pulled, skipped, status: 'dry-run'}

    if (skipped > 0) {
      this.warn(`${pluralize(skipped, 'snippet')} skipped because they have no name`)
    }

    return {orphans, pulled, skipped, status: 'success'}
  }
}
