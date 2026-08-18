import {confirm} from '@inquirer/prompts'
import got from 'got'
import {Listr} from 'listr2'

import {authManager} from '../config/auth.manager.js'
import {API_URL} from './api-client.js'
import {LoopressCommand} from './base.js'
import {isInteractive} from './interactive.js'

export abstract class PushCommand extends LoopressCommand {
  protected failedCount = 0
  // Refusals of the production guard never reach the site, so they must not pollute the
  // deployment history with failure records.
  private refusedByGuard = false

  async catch(err: Error): Promise<void> {
    if (!this.dryRun && !this.refusedByGuard && this.siteConfig) {
      await this.recordDeployment('failure')
    }

    return super.catch(err)
  }

  // Pushing to an environment named "production" needs explicit intent: a TTY confirmation
  // (Enter accepts), or --yes in scripts and CI. Dry runs are exempt, they change nothing.
  protected async guardProductionPush(): Promise<void> {
    if (this.siteConfig.name.toLowerCase() !== 'production' || this.dryRun || this.yes) return

    if (!isInteractive()) {
      this.refusedByGuard = true
      this.error('Target environment is "production". Pass --yes to confirm the push in a non-interactive run.')
    }

    const isProceed = await confirm({default: true, message: `Push to production (${this.siteConfig.url})?`})
    if (!isProceed) {
      this.refusedByGuard = true
      this.error('Aborted.')
    }
  }

  async init(): Promise<void> {
    await super.init()
    await this.guardProductionPush()
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

  // Shared shape of every resource's push list: sequential (`concurrent: false` avoids
  // clobbering `failedCount` and interleaving WordPress writes), and a failing item never
  // stops its siblings (`exitOnError: false`) so `failedCount` reflects every failure, not
  // just the first. `label` feeds the "Push <label>" task title; `task` does the actual work
  // and reports its own failure through `reportTaskFailure`.
  protected async runPushTasks<T>(
    items: T[],
    label: (item: T) => string,
    task: (item: T, task?: {output: string}) => Promise<void>,
  ): Promise<void> {
    await new Listr(
      items.map((item) => ({
        task: async (_ctx, taskCtx) => task(item, taskCtx),
        title: `Push ${label(item)}`,
      })),
      {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
    ).run()
  }
}
