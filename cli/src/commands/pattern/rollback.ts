import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('pattern', {
  description: 'Restore block patterns to a snapshot taken automatically before an earlier `lps pattern push`',
  pathNoun: 'patterns directory',
})
