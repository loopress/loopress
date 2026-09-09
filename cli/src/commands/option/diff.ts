import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('option', {
  description: 'Show what differs, for locally tracked options, between your local files and a WordPress environment, or between two environments',
  pathNoun: 'options directory',
})
