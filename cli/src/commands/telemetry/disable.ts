import {Command} from '@oclif/core'

import {configManager} from '../../config/project-config.manager.js'

export default class TelemetryDisable extends Command {
  static description = 'Disable error reporting to Sentry'
  static examples = ['$ lps telemetry disable']

  async run(): Promise<void> {
    if (configManager.isTelemetryDisabled()) {
      this.log('Error reporting is already disabled.')
      return
    }

    configManager.setTelemetryDisabled(true)
    this.log('Error reporting disabled.')
  }
}
