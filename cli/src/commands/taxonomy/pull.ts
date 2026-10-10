import {declaredPullCommand} from '../../lib/declared-type-command.js'
import {TAXONOMY_SPEC} from '../../utils/declared-type-format.js'

export default declaredPullCommand(
  TAXONOMY_SPEC,
  'Pull the taxonomies Loopress manages on WordPress into taxonomies/<slug>.json files, never their terms. ' +
    'Taxonomies registered by a theme or another plugin are never pulled, see `lps taxonomy list`.',
)
