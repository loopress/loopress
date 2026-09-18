import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('acf', {
  description: 'Restore ACF field groups, post types, taxonomies, and options pages to a snapshot taken automatically before an earlier `lps acf push`',
  pathNoun: 'ACF directory',
})
