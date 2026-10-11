import {declaredPullCommand} from '../../lib/declared-type-command.js'
import {ROLE_SPEC} from '../../utils/declared-type-format.js'

export default declaredPullCommand(
  ROLE_SPEC,
  'Pull the roles Loopress manages on WordPress into roles/<slug>.json files. ' +
    'Built-in roles and roles created by a plugin are never pulled, see `lps role list`.',
)
