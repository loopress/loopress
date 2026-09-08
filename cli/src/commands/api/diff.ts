import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('api', {
  description:
    'Show what differs in custom API route files between your local files and a WordPress environment, or between two environments',
  pathNoun: 'api directory',
})
