import {appProvider, restoreApps} from '../../lib/app-snapshot.js'
import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('app', {
  description:
    'Restore the single-page apps to a snapshot taken automatically before an earlier `lps app push`: each app goes back to the build it had, from the copy of its files the snapshot keeps. An app the push created is removed.',
  mirror: true,
  pathNoun: 'apps directory (unused)',
  provider: appProvider,
  restore: restoreApps,
})
