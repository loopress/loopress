import {LoopressCommand} from '../../lib/base.js'
import {BLOCKS_ENDPOINT, type RemoteBlock} from '../../utils/block-format.js'
import {pluralize} from '../../utils/pluralize.js'

export default class List extends LoopressCommand {
  static override description = 'List the dynamic blocks Loopress registers on WordPress (loopress/<slug>), with their load and render errors'
  static override enableJsonFlag = true
  static override examples = ['$ lps block list']

  async run(): Promise<RemoteBlock[]> {
    const blocks = await this.wp.get<RemoteBlock[]>(BLOCKS_ENDPOINT)

    if (blocks.length === 0) {
      this.log('No dynamic blocks found')
      return blocks
    }

    this.log(`Found ${pluralize(blocks.length, 'block')}:`)
    for (const block of blocks) {
      const notRegistered = block.error ? `  not registered: ${block.error}` : ''
      this.log(`  loopress/${block.slug}  (${Object.keys(block.files).join(', ')})${notRegistered}`)
      if (block.runtimeError) this.log(`    render.php threw, last at ${block.runtimeError.at}: ${block.runtimeError.message}`)
    }

    return blocks
  }
}
