import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('menu', {
  description:
    'Show what differs in nav menus and the active theme menu locations between your local files and a WordPress environment, or between two environments',
  pathNoun: 'menus directory',
})
