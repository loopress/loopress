import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('meta', {
  description: 'Show what differs in post meta keys between your local meta/ files and a WordPress environment, or between two environments',
  pathNoun: 'meta directory',
})
