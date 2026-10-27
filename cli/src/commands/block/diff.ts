import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('block', {
  description: 'Show what differs in dynamic blocks between your local blocks/ folders and a WordPress environment, or between two environments',
  pathNoun: 'blocks directory',
})
