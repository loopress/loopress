import {commands} from '@oclif/plugin-plugins'

export default class CliPluginsUpdate extends (commands['plugins:update'] as any) {}
