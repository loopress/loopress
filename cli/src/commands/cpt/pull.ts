import {declaredPullCommand} from '../../lib/declared-type-command.js'
import {CPT_SPEC} from '../../utils/declared-type-format.js'

export default declaredPullCommand(
  CPT_SPEC,
  'Pull the custom post types Loopress manages on WordPress into cpt/<slug>.json files. ' +
    'Post types registered by a theme or another plugin are never pulled, see `lps cpt list`.',
)
