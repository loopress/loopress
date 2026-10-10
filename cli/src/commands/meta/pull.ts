import {declaredPullCommand} from '../../lib/declared-type-command.js'
import {META_SPEC} from '../../utils/declared-type-format.js'

export default declaredPullCommand(
  META_SPEC,
  'Pull the post meta keys Loopress manages on WordPress into meta/<post-type>.json files, never their values. ' +
    'Keys registered by a theme or another plugin are never pulled, see `lps meta list`.',
)
