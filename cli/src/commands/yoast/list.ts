import {Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {DEFAULT_POST_TYPES, YoastPostMeta, yoastPostMetaEndpoint} from '../../utils/yoast-format.js'

export default class List extends LoopressCommand {
  static description = 'List posts with Yoast SEO meta configured on WordPress'
  static examples = ['$ lps yoast list', '$ lps yoast list --post-type post']
  static flags = {
    json: Flags.boolean({char: 'j', description: 'Output in JSON format'}),
    'post-type': Flags.string({description: 'Limit to specific post types', multiple: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(List)
    const postTypes = flags['post-type'] && flags['post-type'].length > 0 ? flags['post-type'] : [...DEFAULT_POST_TYPES]

    const byType: Record<string, YoastPostMeta[]> = {}
    for (const postType of postTypes) {
      byType[postType] = await this.wp.get<YoastPostMeta[]>(yoastPostMetaEndpoint(postType))
    }

    if (flags.json) {
      this.log(JSON.stringify(byType, null, 2))
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
  }
}
