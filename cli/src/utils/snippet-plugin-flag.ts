import {Flags} from '@oclif/core'

export const snippetPluginFlag = {
  plugin: Flags.string({
    char: 'p',
    description: 'WordPress snippet plugin to target (overrides loopress.json)',
    options: ['code-snippets', 'wpcode'],
  }),
}
