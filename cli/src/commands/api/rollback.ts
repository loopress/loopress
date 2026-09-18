import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('api', {
  description: 'Restore API route files to a snapshot taken automatically before an earlier `lps api push`',
  pathNoun: 'api directory',
})
