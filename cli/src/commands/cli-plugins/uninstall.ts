import {commands} from '@oclif/plugin-plugins'

export default class CliPluginsUninstall extends (commands['plugins:uninstall'] as any) {
  static aliases: string[] = []
}
