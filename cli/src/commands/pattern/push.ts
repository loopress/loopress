import {declaredPushCommand} from '../../lib/declared-type-command.js'
import {PATTERN_SPEC} from '../../utils/declared-type-format.js'

export default declaredPushCommand(
  PATTERN_SPEC,
  'Push local block patterns (patterns/<slug>.html, block markup under a title/categories header) to WordPress, ' +
    'registered as loopress/<slug> and referenced with <!-- wp:pattern {"slug":"loopress/<slug>"} /-->. Create or update only, never deletes a pattern (use `lps pattern rm`).',
)
