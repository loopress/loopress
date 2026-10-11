import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('role', {
  description: 'Show what differs in roles between your local roles/ files and a WordPress environment, or between two environments',
  pathNoun: 'roles directory',
})
