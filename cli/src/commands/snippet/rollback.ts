import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('snippet', {
  description: 'Restore snippets to a snapshot taken automatically before an earlier `lps snippet push`',
  pathNoun: 'snippets directory',
})
