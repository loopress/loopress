import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

export default class TelemetryEnable extends Command {
  static override description = 'Opt in to error reporting to Sentry (off until you say yes)'
  static override examples = ['$ lps telemetry enable']

  async run(): Promise<void> {
    if (configManager.getTelemetryConsent() === true) {
      this.log('Error reporting is already enabled.')
      return
    }

    configManager.setTelemetryDisabled(false)
    this.log('Error reporting enabled.')
  }
}
