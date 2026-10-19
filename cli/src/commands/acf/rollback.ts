import {resourceRollbackCommand} from '../../lib/rollback-command.js'

const Command = resourceRollbackCommand('acf', {
  description: 'Restore ACF field groups, post types, taxonomies, and options pages to a snapshot taken automatically before an earlier `lps acf push`',
  pathNoun: 'ACF directory',
})
Command.aliases = ['scf:rollback']

export default Command
