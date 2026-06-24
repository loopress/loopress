import {commands} from '@oclif/plugin-plugins'

export default class CliPluginsInstall extends (commands['plugins:install'] as any) {
  static aliases: string[] = []
}
