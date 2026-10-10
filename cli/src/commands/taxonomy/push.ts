import {declaredPushCommand} from '../../lib/declared-type-command.js'
import {TAXONOMY_SPEC} from '../../utils/declared-type-format.js'

export default declaredPushCommand(
  TAXONOMY_SPEC,
  'Push local taxonomies (taxonomies/<slug>.json, register_taxonomy() arguments plus "object_type") to WordPress. ' +
    'Create or update only, never deletes a taxonomy (use `lps taxonomy rm`), never touches its terms.',
)
