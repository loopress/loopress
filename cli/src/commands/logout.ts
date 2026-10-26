import {Command} from '@oclif/core'

import {authManager} from '../config/auth.manager.js'

export default class Logout extends Command {
  static override description = 'Log out from the Loopress console'
  static override examples = ['$ lps logout']

  async run(): Promise<void> {
    const auth = authManager.getAuth()

    if (!auth) {
      this.log('You are not logged in.')
      return
    }

    authManager.clearAuth()
    const emailSuffix = auth.email ? ` (${auth.email})` : ''
    this.log(`Logged out${emailSuffix}.`)
  }
}
