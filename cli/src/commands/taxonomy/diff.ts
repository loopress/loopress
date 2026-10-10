import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('taxonomy', {
  description: 'Show what differs in taxonomies between your local taxonomies/ files and a WordPress environment, or between two environments',
  pathNoun: 'taxonomies directory',
})
