import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('pattern', {
  description: 'Show what differs in block patterns between your local patterns/ files and a WordPress environment, or between two environments',
  pathNoun: 'patterns directory',
})
