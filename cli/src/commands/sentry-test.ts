import {Command} from '@oclif/core'

export default class SentryTest extends Command {
  static description = 'Throw a test error to verify Sentry error reporting is wired up correctly'
  static hidden = true

  async run(): Promise<void> {
    throw new Error('Sentry test error from `lps sentry-test`')
  }
}
