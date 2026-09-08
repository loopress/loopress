import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('snippet', {
  description:
    'Show what differs in snippets between your local files and a WordPress environment, or between two environments',
  pathNoun: 'snippets directory',
})
