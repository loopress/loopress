import {declaredListCommand} from '../../lib/declared-type-command.js'
import {CPT_SPEC} from '../../utils/declared-type-format.js'

export default declaredListCommand(
  CPT_SPEC,
  'List the post types registered on WordPress and where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin). ' +
    'Only Loopress ones are pulled and pushed.',
  (count) => `${count} published`,
)
