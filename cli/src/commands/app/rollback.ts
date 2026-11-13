import {APP_RESOURCE, appProvider, restoreApps} from '../../lib/app-snapshot.js'
import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand(APP_RESOURCE, {
  description:
    'Restore the single-page apps to a snapshot taken automatically before an earlier `lps app push`: uploads the files of the previous build that differ, then commits it. An app that push created is not removed (use `lps app rm`).',
  pathNoun: 'apps directory',
  provider: appProvider,
  restore: restoreApps,
})
