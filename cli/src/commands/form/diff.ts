import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('form', {
  description: 'Show what differs in forms between your local files and a WordPress environment, or between two environments',
  pathNoun: 'forms directory',
})
