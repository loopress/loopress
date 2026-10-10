import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('taxonomy', {
  description: 'Restore taxonomies to a snapshot taken automatically before an earlier `lps taxonomy push`',
  pathNoun: 'taxonomies directory',
})
