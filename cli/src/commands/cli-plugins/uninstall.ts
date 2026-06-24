import {commands} from '@oclif/plugin-plugins'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default class CliPluginsUninstall extends (commands['plugins:uninstall'] as any) {
  static aliases: string[] = []
}
