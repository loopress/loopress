import {declaredRmCommand} from '../../lib/declared-type-command.js'
import {TAXONOMY_SPEC} from '../../utils/declared-type-format.js'

export default declaredRmCommand(
  TAXONOMY_SPEC,
  'Stop registering a Loopress taxonomy on WordPress. Its terms are kept in the database, hidden until the taxonomy is pushed again.',
  'Its terms',
)
