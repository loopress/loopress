import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('page', {
  description: 'Show what differs in pages between your local files and a WordPress environment, or between two environments',
  pathNoun: 'pages directory',
})
