import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('cpt', {
  description: 'Restore custom post types to a snapshot taken automatically before an earlier `lps cpt push`',
  pathNoun: 'cpt directory',
})
