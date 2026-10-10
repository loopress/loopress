import {LoopressCommand} from '../../lib/base.js'
import {REGISTERED_POST_TYPES_ENDPOINT, type RegisteredPostType} from '../../utils/cpt-format.js'

const SOURCE_LABELS: Record<RegisteredPostType['source'], string> = {
  acf: 'ACF',
  cptui: 'CPT UI',
  loopress: 'Loopress',
  other: 'theme or plugin',
  wordpress: 'WordPress',
}

export default class List extends LoopressCommand {
  static description =
    'List the post types registered on WordPress and where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin). ' +
    'Only Loopress ones are pulled and pushed.'

  static enableJsonFlag = true
  static examples = ['$ lps cpt list']

  async run(): Promise<RegisteredPostType[]> {
    const postTypes = await this.wp.get<RegisteredPostType[]>(REGISTERED_POST_TYPES_ENDPOINT)

    for (const postType of postTypes) {
      this.log(`${postType.slug} (${postType.label}): ${SOURCE_LABELS[postType.source]}, ${postType.count} published`)
      if (postType.conflict) {
        this.warn(`${postType.slug}: declared in cpt/ but already registered by ${SOURCE_LABELS[postType.source]}, the Loopress version is skipped`)
      }
    }

    return postTypes
  }
}
