import {LoopressCommand} from '../../lib/base.js'
import {META_SPEC} from '../../utils/declared-type-format.js'

// Mirrors the plugin's PostMetaService::registered(): one row per key, not per post type.
type RegisteredMetaKey = {
  acf: boolean
  conflict: boolean
  key: string
  managed: boolean
  postType: string
  showInRest: boolean
  single: boolean
  source: 'loopress' | 'other'
  type: string
}

export default class MetaList extends LoopressCommand {
  static description =
    'List the meta keys registered for each post type on WordPress (with register_post_meta()), and whether Loopress declares them. ' +
    'Only Loopress ones are pulled and pushed.'

  static enableJsonFlag = true
  static examples = ['$ lps meta list']

  async run(): Promise<RegisteredMetaKey[]> {
    const keys = await this.wp.get<RegisteredMetaKey[]>(META_SPEC.registeredEndpoint)

    for (const meta of keys) {
      const source = meta.source === 'loopress' ? 'Loopress' : 'theme or plugin'
      const rest = meta.showInRest ? ', in REST' : ''
      const acf = meta.acf ? ', same name as an ACF field' : ''
      this.log(`${meta.postType}.${meta.key} (${meta.type}): ${source}${rest}${acf}`)
      if (meta.conflict) {
        this.warn(`${meta.postType}.${meta.key}: declared in meta/ but already registered by a theme or plugin, the Loopress version is skipped`)
      }
    }

    return keys
  }
}
