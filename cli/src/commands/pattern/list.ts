import {declaredListCommand} from '../../lib/declared-type-command.js'
import {PATTERN_SPEC} from '../../utils/declared-type-format.js'

export default declaredListCommand(
  PATTERN_SPEC,
  'List the block patterns registered on WordPress by Loopress, the theme and plugins (not WordPress core). Only Loopress ones are pulled and pushed.',
  () => '',
)
