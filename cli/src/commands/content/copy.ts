import {confirm} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'
import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {stdoutToStderr} from '../../lib/json-delegation.js'
import {isLocalEnvironment, LOCAL_ENVIRONMENT_NAME, WpClient} from '../../lib/wp-client.js'
import {pluralize} from '../../utils/pluralize.js'

type ContentInfo = {home: string; uploadsUrl: string}

type ContentPage = Record<string, unknown> & {next: null | number}

type ContentCopyResult = {from: string; posts: number; status: 'copied' | 'dry-run'; terms: number}

const BATCH_SIZE = 100

// Code goes up, content comes down: the content of <from> replaces the local site's, IDs
// unchanged, never the reverse and never into the repo. Not a `pull`: nothing is written to
// local files. The target is always "local", so there is no --env (this.wp is the local site),
// <from> names the source like `lps promote`. Terms go first, so the post batches can attach
// their term relationships. The plugin refuses the import on any site whose environment type is
// not "local", whatever this command is pointed at.
export default class Copy extends LoopressCommand {
  static args = {
    from: Args.string({description: 'Environment to copy the content from', required: true}),
  }

  // Hidden, not removed: the type of LoopressCommand.baseFlags requires it. Any value other than
  // "local" is refused in run().
  static baseFlags = {
    env: Flags.string({hidden: true}),
  }

  static description =
    'Replace the local site\'s content (posts, pages, public custom post types, terms) with the content of <from>, then push the project to the local site so tracked configuration wins. Media stay served by <from>, users, comments and orders are never copied.'

  static enableJsonFlag = true
  static examples = ['$ lps content copy production', '$ lps content copy staging --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<ContentCopyResult> {
    const {args} = await this.parse(Copy)
    const {from} = args
    if (!isLocalEnvironment(this.siteConfig.name)) {
      this.error(`Content is only ever copied into the "${LOCAL_ENVIRONMENT_NAME}" environment. Run \`lps project config\` to add it if the project has none.`)
    }

    if (isLocalEnvironment(from)) {
      this.error(`<from> must be another environment than "${LOCAL_ENVIRONMENT_NAME}", e.g. \`lps content copy production\`.`)
    }

    const source = this.sourceWp(from)
    if (!this.dryRun) await this.confirmReplace(from)

    const info = await source.get<ContentInfo>('loopress/v1/content')
    if (!this.dryRun) {
      await this.wp.post('loopress/v1/content/reset', {home: info.home, uploadsUrl: info.uploadsUrl})
    }

    this.log(`\n→ Copying terms from ${from}...`)
    const terms = await this.copy('terms', source)
    this.log(`→ Copying posts from ${from}...`)
    const posts = await this.copy('posts', source)

    const summary = `${pluralize(posts, 'post')} and ${pluralize(terms, 'term')}`
    if (this.dryRun) {
      this.log(`\n[dry-run] Would replace the local content with ${summary} from ${from}, then push the project to ${LOCAL_ENVIRONMENT_NAME}.`)
      return {from, posts, status: 'dry-run', terms}
    }

    this.log(`\n→ Pushing the project to ${LOCAL_ENVIRONMENT_NAME}...`)
    await stdoutToStderr(this.jsonEnabled(), async () => this.config.runCommand('push', ['--env', LOCAL_ENVIRONMENT_NAME, '--yes']))

    this.log(`\nCopied ${summary} from ${from}.`)
    return {from, posts, status: 'copied', terms}
  }

  // Overridable seam for tests, like `wpClient` on LoopressCommand.
  protected sourceWp(from: string): WpClient {
    const project = configManager.getProject(this.projectId)
    const env = project?.environments[from]
    if (!env) {
      this.error(`Environment "${from}" not found. Available: ${Object.keys(project?.environments ?? {}).join(', ')}`)
    }

    if (!env.token) this.error(`No credentials configured for ${env.url}. Run \`lps project config\` to add them.`)

    return new WpClient(env.url, env.token, env.name)
  }

  private async confirmReplace(from: string): Promise<void> {
    if (this.yes) return

    const message = `This deletes the posts, pages and terms of the "${LOCAL_ENVIRONMENT_NAME}" site and replaces them with ${from}'s.`
    if (!isInteractive()) this.error(`${message} Pass --yes to confirm.`)

    const isProceed = await confirm({default: true, message: `${message} Continue?`})
    if (!isProceed) this.error('Aborted.')
  }

  // Pages through the source, each page posted to the local site as is.
  private async copy(kind: 'posts' | 'terms', source: WpClient): Promise<number> {
    let count = 0
    let after: null | number = 0
    while (after !== null) {
      const page: ContentPage = await source.get<ContentPage>(`loopress/v1/content/${kind}?after=${after}&limit=${BATCH_SIZE}`)
      const {next, ...rows} = page
      count += (rows[kind] as unknown[]).length
      if (!this.dryRun) await this.wp.post(`loopress/v1/content/${kind}`, rows)
      after = next
    }

    return count
  }
}
