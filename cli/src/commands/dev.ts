import {Command, Flags} from '@oclif/core'
import {watch as watchFiles} from 'chokidar'
import {basename} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {buildWatchTargets, createDebouncedBatcher, resolveResourceTypes, RESOURCE_TYPES, type ResourceType, resourceTypeForPath, type WatchTarget} from '../lib/dev-watch.js'
import {readLocalConfig} from '../utils/loopress-config.js'

const DEBOUNCE_MS = 400
// Noise no one wants pushed: VCS internals, deps, and editor/OS droppings.
const IGNORED = /(^|[/\\])(\.git|node_modules|\.DS_Store)(?:[/\\]|$)|\.swp$/

export default class Dev extends Command {
  static description =
    'Watch project files and push changes to the local WordPress instance as they happen. Always targets the "local" environment, run `lps snippet push` etc. directly for any other environment.'

  static examples = ['$ lps dev', '$ lps dev --only=snippets,pages', '$ lps dev --skip=plugins']
  static flags = {
    only: Flags.string({description: `Only watch these resource types (comma-separated): ${RESOURCE_TYPES.join(', ')}`}),
    skip: Flags.string({description: `Skip these resource types (comma-separated): ${RESOURCE_TYPES.join(', ')}`}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Dev)

    const only = flags.only ? this.parseTypeFlag(flags.only, 'only') : undefined
    const skip = flags.skip ? this.parseTypeFlag(flags.skip, 'skip') : []
    const types = resolveResourceTypes(only, skip)

    const localConfig = await readLocalConfig()
    const projectId = localConfig.projectId ?? configManager.getCurrentProject()?.id
    if (!projectId) this.error('No project configured. Run `lps project config` first.')
    if (!configManager.getEnvironment(projectId, 'local')) {
      this.error('No "local" environment configured for this project. Run `lps project config` and add a "local" environment.')
    }

    const targets = buildWatchTargets(types, localConfig, process.cwd())
    if (targets.length === 0) {
      this.error('Nothing to watch: none of the selected resource directories exist yet.')
    }

    for (const target of targets) this.log(`Watching ${target.type}: ${target.path}`)

    await this.watch(targets)
  }

  private parseTypeFlag(raw: string, flagName: 'only' | 'skip'): ResourceType[] {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        if (!RESOURCE_TYPES.includes(value as ResourceType)) {
          this.error(`Unknown resource type "${value}" in --${flagName}. Valid types: ${RESOURCE_TYPES.join(', ')}`)
        }

        return value as ResourceType
      })
  }

  // Sequential on purpose (see notes technique: parallelizing push is out of scope). A failed
  // push is logged and swallowed here, never thrown, so one bad batch can't take the watcher down.
  private async pushBatch(changesByType: Map<ResourceType, string[]>, targets: WatchTarget[]): Promise<void> {
    for (const [type, paths] of changesByType) {
      const target = targets.find((t) => t.type === type)
      if (!target) continue

      this.log(`\n→ ${type} changed (${paths.map((path) => basename(path)).join(', ')}), pushing to local...`)
      try {
        await this.config.runCommand(target.commandId, ['--env', 'local'])
        this.log(`✓ ${type} synced`)
      } catch (error) {
        this.log(`✗ ${type} failed: ${(error as Error).message}`)
      }
    }
  }

  private async watch(targets: WatchTarget[]): Promise<void> {
    const batcher = createDebouncedBatcher(async (paths) => {
      const changesByType = new Map<ResourceType, string[]>()
      for (const path of paths) {
        const type = resourceTypeForPath(path, targets)
        if (!type) continue
        changesByType.set(type, [...(changesByType.get(type) ?? []), path])
      }

      await this.pushBatch(changesByType, targets)
    }, DEBOUNCE_MS)

    const watcher = watchFiles(
      targets.map((target) => target.path),
      {
        awaitWriteFinish: {pollInterval: 100, stabilityThreshold: 300},
        ignoreInitial: true,
        ignored: (path: string) => IGNORED.test(path),
      },
    )

    watcher
      .on('add', batcher.queue)
      .on('change', batcher.queue)
      .on('unlink', (filePath: string) => { this.log(`⚠ ${filePath} deleted locally, not synced automatically`); })

    this.log('\nWatching for changes. Press Ctrl+C to stop.\n')

    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => { resolve(); })
    })

    batcher.cancel()
    await watcher.close()
    // A push failure mid-session sets process.exitCode; stopping the watcher on purpose is a
    // clean exit regardless of that history (see AC: no meaningful exit code needed for `dev`).
    process.exitCode = 0
    this.log('\nStopped watching.')
  }
}
