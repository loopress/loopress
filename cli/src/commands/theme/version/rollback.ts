import {packageDowngrades, restoreThemes, themeLockProvider} from '../../../lib/lockfile-rollback.js'
import {resourceRollbackCommand} from '../../../lib/rollback-command.js'

export default resourceRollbackCommand('theme-version', {
  command: 'theme version',
  description:
    'Restore the WordPress.org theme versions to a snapshot taken automatically before an earlier `lps theme version push`. A theme the push installed is uninstalled, one it uninstalled is reinstalled. Never switches the active theme. A downgrade needs --force.',
  downgrades: packageDowngrades,
  mirror: true,
  pathNoun: 'project (unused)',
  provider: themeLockProvider,
  restore: restoreThemes,
})
