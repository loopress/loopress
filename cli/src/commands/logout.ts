import {Command} from '@oclif/core'

import {authManager} from '../config/auth.manager.js'

export default class Logout extends Command {
  static description = 'Log out from Loopress console'
  static examples = ['$ lps logout']

  async run(): Promise<void> {
    const auth = authManager.getAuth()

    if (!auth) {
      this.log('You are not logged in.')
      return
    }

    authManager.clearAuth()
    this.log(`✅ Logged out${auth.email ? ` (${auth.email})` : ''}.`)
  }
}
