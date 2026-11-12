import {composerDowngrades, composerProvider, restoreComposer} from '../../lib/lockfile-rollback.js'
import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('composer', {
  description:
    "Restore the site's composer.json to a snapshot taken automatically before an earlier `lps composer push`, then run Composer on it. A package the push added is uninstalled. A downgrade needs --force: it does not undo database migrations.",
  downgrades: composerDowngrades,
  mirror: true,
  pathNoun: 'project (unused)',
  provider: composerProvider,
  restore: restoreComposer,
})
