import got from 'got'

import {authManager} from '../config/auth.manager.js'
import {API_URL} from './api-client.js'
import {LoopressCommand} from './base.js'

export abstract class PushCommand extends LoopressCommand {
  protected failedCount = 0

  async catch(err: Error): Promise<void> {
    if (!this.dryRun && this.siteConfig) {
      await this.recordDeployment('failure')
    }

    return super.catch(err)
  }

  protected async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token ?? null
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

  // Reports one failed Listr task: status lines go through `task.output` when running inside a
  // Listr renderer (this.warn would race with the repaint), and fall back to `this.warn` when
  // called without a task (e.g. directly in tests). Rethrowing is what lets Listr mark the task
  // failed (red cross) instead of completed; `exitOnError: false` on the list still lets sibling
  // tasks run, and the accumulated `failedCount` drives the command's final "N failed" error.
  protected reportTaskFailure(message: string, error: unknown, task?: {output: string}): never {
    if (task) task.output = message
    else this.warn(`  ${message}`)

    this.failedCount++
    throw error
  }
}
