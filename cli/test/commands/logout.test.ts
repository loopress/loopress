import {describe, expect, it, vi} from 'vitest'

import Logout from '../../src/commands/logout.js'
import {authManager} from '../../src/config/auth.manager.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'

describe('logout', () => {
  it('clears the stored auth and reports the email', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue({email: 'max@example.com', savedAt: '2024-01-01', token: 't'})
    const clearAuth = vi.spyOn(authManager, 'clearAuth').mockImplementation(() => {})

    const cmd = new Logout([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(clearAuth).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('Logged out (max@example.com).')
  })

  it('does nothing when not logged in', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue(null)
    const clearAuth = vi.spyOn(authManager, 'clearAuth').mockImplementation(() => {})

    const cmd = new Logout([], fakeOclifConfig)
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(clearAuth).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('You are not logged in.')
  })
})
