import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('menu', {
  description: 'Restore nav menus and menu locations to a snapshot taken automatically before an earlier `lps menu push`',
  pathNoun: 'menus directory',
})
