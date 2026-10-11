import {declaredRmCommand} from '../../lib/declared-type-command.js'
import {PATTERN_SPEC} from '../../utils/declared-type-format.js'

export default declaredRmCommand(
  PATTERN_SPEC,
  'Stop registering a Loopress block pattern on WordPress. A wp:pattern reference to it renders nothing, copies already inserted in posts stay.',
  'A wp:pattern reference to it renders nothing until it is pushed again, copies already inserted in posts stay.',
)
