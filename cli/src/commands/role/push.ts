import {declaredPushCommand} from '../../lib/declared-type-command.js'
import {ROLE_SPEC} from '../../utils/declared-type-format.js'

export default declaredPushCommand(
  ROLE_SPEC,
  'Push local roles (roles/<slug>.json, a "name" and its "capabilities") to WordPress. ' +
    'Create or update only, never deletes a role (use `lps role rm`), never changes which users have it.',
)
