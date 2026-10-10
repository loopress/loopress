import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('meta', {
  description: 'Restore post meta keys to a snapshot taken automatically before an earlier `lps meta push`',
  pathNoun: 'meta directory',
})
