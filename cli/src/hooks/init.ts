import type {Hook} from '@oclif/core'

import {authManager} from '../config/auth.manager.js'
import {configManager} from '../config/project-config.manager.js'

// configManager/authManager start unconfigured and throw if used before a directory is set.
// This hook runs before any command and points them at oclif's native, per-platform config/data
// directories as soon as the real CLI Config is available.
const hook: Hook.Init = async function ({config}) {
  configManager.setConfigDir(config.configDir)
  authManager.setDataDir(config.dataDir)
}

export default hook
