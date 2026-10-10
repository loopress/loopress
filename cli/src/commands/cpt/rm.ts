import {declaredRmCommand} from '../../lib/declared-type-command.js'
import {CPT_SPEC} from '../../utils/declared-type-format.js'

export default declaredRmCommand(
  CPT_SPEC,
  'Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post type is pushed again.',
  'Its posts',
)
