import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('hook', {
  description: 'Show what differs in hook files between your local files and a WordPress environment, or between two environments',
  pathNoun: 'hooks directory',
})
