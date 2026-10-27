import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('block', {
  description: 'Restore dynamic blocks to a snapshot taken automatically before an earlier `lps block push`',
  pathNoun: 'blocks directory',
})
