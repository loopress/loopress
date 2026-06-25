import got from 'got'

import {authManager} from '../config/auth.manager.js'
import {LoopressCommand} from './base.js'

const API_URL = process.env.LPS_API_URL ?? 'https://api.loopress.dev'

export abstract class PushCommand extends LoopressCommand {
  protected dryRun = false

  async catch(err: Error): Promise<void> {
    if (!this.dryRun && this.siteConfig) {
      await this.recordDeployment('failure')
    }

    return super.catch(err)
  }

  protected async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    const token = process.env.LPS_TOKEN ?? authManager.getAuth()?.token ?? null
    if (!token) return

    try {
      await got.post(`${API_URL}/deployments`, {
        headers: {Authorization: `Bearer ${token}`},
        json: {status, url: this.siteConfig.url},
        timeout: {request: 3000},
      })
    } catch {
      // non-blocking: recording must never interrupt the push flow
    }
  }

  protected async recordSuccess(): Promise<void> {
    if (!this.dryRun) await this.recordDeployment('success')
  }
}
