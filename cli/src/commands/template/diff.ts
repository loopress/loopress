import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('template', {
  description: 'Show what differs in block templates between your local files and a WordPress environment, or between two environments',
  pathNoun: 'templates directory',
})
