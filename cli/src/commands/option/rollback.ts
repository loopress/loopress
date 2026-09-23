import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('option', {
  description: 'Restore tracked options to a snapshot taken automatically before an earlier `lps option push`',
  pathNoun: 'options directory',
})
