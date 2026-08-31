import {LoopressCommand} from '../../lib/base.js'
import {pluralize} from '../../utils/pluralize.js'

type RemoteApp = {
  buildId: null | string
  committed: boolean
  deployedAt: null | string
  fileCount: number
  name: string
  routing: null | string
  totalBytes: number
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default class List extends LoopressCommand {
  static description = 'List single-page apps deployed to WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps app list']

  async run(): Promise<RemoteApp[]> {
    const apps = await this.wp.get<RemoteApp[]>('loopress/v1/apps')

    this.log(`Apps (${apps.length}):`)
    if (apps.length === 0) {
      this.log('  (none)')
      return apps
    }

    for (const app of apps) {
      this.log(`  ${app.name}`)
      if (app.committed) {
        this.log(`     Build:  ${app.buildId ?? '(unknown)'}`)
        this.log(`     Files:  ${pluralize(app.fileCount, 'file')}, ${humanBytes(app.totalBytes)}`)
        if (app.deployedAt) this.log(`     Deployed: ${app.deployedAt}`)
      } else {
        this.log('     (uploaded but never committed, run `lps app push` to finish)')
      }
    }

    return apps
  }
}
