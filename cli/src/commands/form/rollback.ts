import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('form', {
  description: 'Restore forms to a snapshot taken automatically before an earlier `lps form push`',
  pathNoun: 'forms directory',
})
