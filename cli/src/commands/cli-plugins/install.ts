import {commands} from '@oclif/plugin-plugins'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default class CliPluginsInstall extends (commands['plugins:install'] as any) {
  static aliases: string[] = []
}
