import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {DEFAULT_POST_TYPES, SEO_REDIRECTS_ENDPOINT, SeoPostMeta, seoPostMetaEndpoint, SeoRedirect} from '../../utils/seo-format.js'

export default class List extends LoopressCommand {
  static description = 'List posts with SEO meta, and redirects if supported by the active SEO plugin, on WordPress'
  static examples = ['$ lps seo list', '$ lps seo list --post-type post']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
    'post-type': Flags.string({description: 'Limit to specific post types', multiple: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const postTypes = flags['post-type'] && flags['post-type'].length > 0 ? flags['post-type'] : [...DEFAULT_POST_TYPES]

    const byType: Record<string, SeoPostMeta[]> = {}
    for (const postType of postTypes) {
      byType[postType] = await this.wp.get<SeoPostMeta[]>(seoPostMetaEndpoint(postType))
    }

    const {redirects, unsupportedReason} = await this.fetchRedirects()

    if (flags.json) {
      this.log(JSON.stringify({postMeta: byType, redirects: redirects ?? undefined, redirectsUnsupported: unsupportedReason}, null, 2))
      return
    }

    for (const postType of postTypes) {
      const posts = byType[postType]
      this.log(`${postType} (${posts.length}):`)

      if (posts.length === 0) {
        this.log('  (none)')
        this.log('')
        continue
      }

      for (const post of posts) {
        this.log(`  ${post.slug}. ${post.title}`)
      }

      this.log('')
    }

    if (unsupportedReason) {
      this.log(`redirects: ${unsupportedReason}`)
      return
    }

    this.log(`redirects (${redirects!.length}):`)
    if (redirects!.length === 0) {
      this.log('  (none)')
      return
    }

    for (const redirect of redirects!) {
      this.log(`  ${redirect.id}. [${redirect.status}] ${redirect.headerCode} -> ${redirect.urlTo}`)
    }
  }

  // Redirects are only supported by some SeoProvider backends (RankMath, not Yoast); reported
  // as a line in the listing rather than failing the whole command, since post meta above may
  // well have succeeded.
  private async fetchRedirects(): Promise<{redirects: null | SeoRedirect[]; unsupportedReason: string | undefined}> {
    try {
      return {redirects: await this.wp.get<SeoRedirect[]>(SEO_REDIRECTS_ENDPOINT), unsupportedReason: undefined}
    } catch (error) {
      return {redirects: null, unsupportedReason: (error as Error).message}
    }
  }
}
