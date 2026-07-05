import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {vi} from 'vitest'

// Managers like `configManager`/`authManager` default to `os.homedir()` when constructed
// without an explicit path. Left unmocked, any test that forgets to stub every mutating
// method would read/write the developer's real ~/.loopress files. Redirect `homedir()` to a
// fresh temp directory for every test file so that can never happen.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  const fakeHome = mkdtempSync(join(actual.tmpdir(), 'lps-test-home-'))
  return {...actual, homedir: () => fakeHome}
})
