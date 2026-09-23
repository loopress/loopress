import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('theme-styles', {
  description:
    "Show what differs in the active block theme's Global Styles (Site Editor > Styles) between your local file and a WordPress environment, or between two environments",
  pathNoun: 'theme styles directory',
})
