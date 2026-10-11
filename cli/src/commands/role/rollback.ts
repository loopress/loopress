import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('role', {
  description: 'Restore roles to a snapshot taken automatically before an earlier `lps role push`',
  pathNoun: 'roles directory',
})
