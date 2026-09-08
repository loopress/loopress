import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('acf', {
  description:
    'Show what differs in ACF field groups, post types, taxonomies, and options pages between your local files and a WordPress environment, or between two environments',
  pathNoun: 'ACF directory',
})
