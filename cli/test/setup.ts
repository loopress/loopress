import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {authManager} from '../src/config/auth.manager.js'
import {configManager} from '../src/config/project-config.manager.js'

// Real CLI runs get their directories from the `init` hook (src/hooks/init.ts), which reads
// oclif's native `config.configDir`/`config.dataDir`. Tests instantiate commands directly and
// never go through that hook, so configure the singletons here against a fresh temp directory
// per test file. Otherwise any test that forgets to stub every mutating method would throw
// (configDir/dataDir unset) instead of exercising real behavior.
const fakeDir = mkdtempSync(join(tmpdir(), 'lps-test-config-'))
configManager.setConfigDir(fakeDir)
authManager.setDataDir(fakeDir)
