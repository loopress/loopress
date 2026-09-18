import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('theme-styles', {
  description: 'Restore the active theme’s Global Styles to a snapshot taken automatically before an earlier `lps theme-styles push`',
  pathNoun: 'theme styles directory',
})
