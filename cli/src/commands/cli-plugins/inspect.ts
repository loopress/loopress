import {commands} from '@oclif/plugin-plugins'

export default class CliPluginsInspect extends (commands['plugins:inspect'] as any) {}
