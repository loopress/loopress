import {declaredPushCommand} from '../../lib/declared-type-command.js'
import {CPT_SPEC} from '../../utils/declared-type-format.js'

export default declaredPushCommand(
  CPT_SPEC,
  'Push local custom post types (cpt/<slug>.json, register_post_type() arguments) to WordPress. ' +
    'Create or update only, never deletes a post type: use `lps cpt rm` for that.',
)
