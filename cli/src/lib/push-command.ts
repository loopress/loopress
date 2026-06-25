import got from 'got'

import {authManager} from '../config/auth.manager.js'
import {LoopressCommand} from './base.js'

const API_URL = process.env.LPS_API_URL ?? 'https://api.loopress.dev'

async function recordDeployment(data: {status: 'failure' | 'success'; url: string}): Promise<void> {
  const token = process.env.LPS_TOKEN ?? authManager.getAuth()?.token ?? null
  if (!token) return

  try {
    await got.post(`${API_URL}/deployments`, {
      headers: {Authorization: `Bearer ${token}`},
      json: data,
      timeout: {request: 3000},
    })
  } catch {
    // non-blocking: recording must never interrupt the push flow
  }
}

export abstract class PushCommand extends LoopressCommand {
  protected dryRun = false

  async catch(err: Error): Promise<void> {
    if (!this.dryRun && this.siteConfig) {
      await recordDeployment({url: this.siteConfig.url, status: 'failure'})
    }
    return super.catch(err)
  }

  protected async recordSuccess(): Promise<void> {
    if (!this.dryRun) await recordDeployment({url: this.siteConfig.url, status: 'success'})
  }
}
