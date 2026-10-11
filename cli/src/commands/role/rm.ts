import {declaredRmCommand} from '../../lib/declared-type-command.js'
import {ROLE_SPEC} from '../../utils/declared-type-format.js'

export default declaredRmCommand(
  ROLE_SPEC,
  'Stop registering a Loopress role on WordPress. Its users keep it in their profile, with no capability until the role is pushed again.',
  'Its users keep it in their profile, with no capability until it is pushed again.',
)
