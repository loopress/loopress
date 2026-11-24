import {APP_RESOURCE, appProvider, createdApps, restoreApps} from '../../lib/app-snapshot.js'
import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand(APP_RESOURCE, {
  description:
    'Restore the single-page apps to a snapshot taken automatically before an earlier `lps app push`: uploads the files of the previous build, then commits it, and removes the apps that push created.',
  pathNoun: 'apps directory',
  provider: appProvider,
  removable: createdApps,
  restore: restoreApps,
})
