import {packageDowngrades, pluginLockProvider, restorePlugins} from '../../lib/lockfile-rollback.js'
import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('plugin', {
  description:
    'Restore the plugins (versions and active state) to a snapshot taken automatically before an earlier `lps plugin push`. A plugin the push installed is uninstalled, one it uninstalled is reinstalled. A downgrade needs --force: it does not undo database migrations.',
  downgrades: packageDowngrades,
  mirror: true,
  pathNoun: 'project (unused)',
  provider: pluginLockProvider,
  restore: restorePlugins,
})
