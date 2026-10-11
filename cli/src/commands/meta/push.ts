import {declaredPushCommand} from '../../lib/declared-type-command.js'
import {META_SPEC} from '../../utils/declared-type-format.js'

export default declaredPushCommand(
  META_SPEC,
  'Push local post meta keys (meta/<post-type>.json, each key mapped to its register_post_meta() arguments) to WordPress. ' +
    'Create or update only, never deletes (use `lps meta rm`), never touches meta values.',
)
