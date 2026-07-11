import type {Hook} from '@oclif/core'

import {authManager} from '../config/auth.manager.js'
import {configManager} from '../config/project-config.manager.js'

// configManager/authManager default to ~/.loopress so they stay usable outside the oclif
// lifecycle (e.g. commands instantiated directly in unit tests). This hook runs before any
// command and redirects them to oclif's native, per-platform directories once the real CLI
// Config is available.
const hook: Hook.Init = async function ({config}) {
  configManager.setConfigDir(config.configDir)
  authManager.setDataDir(config.dataDir)
}

export default hook
