import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('hook', {
  description: 'Restore hook files to a snapshot taken automatically before an earlier `lps hook push`',
  pathNoun: 'hooks directory',
})
