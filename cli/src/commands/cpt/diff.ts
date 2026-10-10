import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('cpt', {
  description: 'Show what differs in custom post types between your local cpt/ files and a WordPress environment, or between two environments',
  pathNoun: 'cpt directory',
})
