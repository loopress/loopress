import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

export default class TelemetryEnable extends Command {
  static description = 'Enable error reporting to Sentry'
  static examples = ['$ lps telemetry enable']

  async run(): Promise<void> {
    if (!configManager.isTelemetryDisabled()) {
      this.log('Error reporting is already enabled.')
      return
    }

    configManager.setTelemetryDisabled(false)
    this.log('Error reporting enabled.')
  }
}
