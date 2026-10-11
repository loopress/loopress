import {declaredPullCommand} from '../../lib/declared-type-command.js'
import {PATTERN_SPEC} from '../../utils/declared-type-format.js'

export default declaredPullCommand(
  PATTERN_SPEC,
  'Pull the block patterns Loopress manages on WordPress into patterns/<slug>.html files. ' +
    'Patterns registered by the theme or a plugin are never pulled, see `lps pattern list`.',
)
