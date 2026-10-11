import {declaredListCommand} from '../../lib/declared-type-command.js'
import {ROLE_SPEC} from '../../utils/declared-type-format.js'
import {pluralize} from '../../utils/pluralize.js'

export default declaredListCommand(
  ROLE_SPEC,
  'List the user roles on WordPress, where each comes from (Loopress, WordPress, a plugin) and how many users have it. Only Loopress ones are pulled and pushed.',
  (count) => pluralize(count, 'user'),
)
