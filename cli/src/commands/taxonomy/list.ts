import {declaredListCommand} from '../../lib/declared-type-command.js'
import {TAXONOMY_SPEC} from '../../utils/declared-type-format.js'
import {pluralize} from '../../utils/pluralize.js'

export default declaredListCommand(
  TAXONOMY_SPEC,
  'List the taxonomies registered on WordPress, where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin) ' +
    'and the post types it attaches to. Only Loopress ones are pulled and pushed.',
  (count) => pluralize(count, 'term'),
)
