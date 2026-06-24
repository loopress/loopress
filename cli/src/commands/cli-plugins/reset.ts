import {commands} from '@oclif/plugin-plugins'

export default class CliPluginsReset extends (commands['plugins:reset'] as any) {}
