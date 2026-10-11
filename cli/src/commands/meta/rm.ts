import {declaredRmCommand} from '../../lib/declared-type-command.js'
import {META_SPEC} from '../../utils/declared-type-format.js'

export default declaredRmCommand(
  META_SPEC,
  'Stop registering the Loopress meta keys of one post type (its meta/<post-type>.json file) on WordPress. Their values are kept in the database.',
  "Their values are kept in the database, hidden until it's pushed again.",
)
