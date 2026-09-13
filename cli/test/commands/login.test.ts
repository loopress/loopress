import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Login from '../../src/commands/login.js'
import {authManager} from '../../src/config/auth.manager.js'
import {openBrowser} from '../../src/lib/open-browser.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'

vi.mock('../../src/lib/open-browser.js', () => ({openBrowser: vi.fn()}))

async function relayCallbackUrl(): Promise<string> {
  await vi.waitFor(() => {
    expect(openBrowser).toHaveBeenCalled()
  })
  const consoleUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0])
  return decodeURIComponent(consoleUrl.searchParams.get('callbackUrl')!)
}

describe('login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the console cli-auth URL with a callbackUrl carrying a state', async () => {
    const cmd = new Login([], fakeOclifConfig)
    silenceLogs(cmd)
    const run = cmd.run()

    await vi.waitFor(() => {
      expect(openBrowser).toHaveBeenCalled()
    })
    const consoleUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0])
    expect(consoleUrl.origin).toBe('https://console.loopress.dev')
    expect(consoleUrl.pathname).toBe('/cli-auth')

    const callbackUrl = new URL(decodeURIComponent(consoleUrl.searchParams.get('callbackUrl')!))
    expect(callbackUrl.pathname).toBe('/callback')
    expect(callbackUrl.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/)

    await got(`${callbackUrl.href}&token=abc123`)
    await run
  })

  it('saves the token and email, and greets the user by email', async () => {
    const setAuth = vi.spyOn(authManager, 'setAuth')
    const cmd = new Login([], fakeOclifConfig)
    const logs = silenceLogs(cmd)
    const run = cmd.run()
    const callbackUrl = await relayCallbackUrl()

    await got(`${callbackUrl}&token=abc123&email=dev%40example.com`)
    await run

    expect(setAuth).toHaveBeenCalledWith(expect.objectContaining({email: 'dev@example.com', token: 'abc123'}))
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Logged in as dev@example.com'))
  })

  it('greets the user with no email suffix when the console does not send one', async () => {
    const cmd = new Login([], fakeOclifConfig)
    const logs = silenceLogs(cmd)
    const run = cmd.run()
    const callbackUrl = await relayCallbackUrl()

    await got(`${callbackUrl}&token=abc123`)
    await run

    expect(logs.log).toHaveBeenCalledWith("\nLogged in. You're all set!")
  })

  it('responds 400 and keeps waiting when the callback is missing a token', async () => {
    const cmd = new Login([], fakeOclifConfig)
    silenceLogs(cmd)
    const run = cmd.run()
    const callbackUrl = await relayCallbackUrl()

    const badResponse = await got(callbackUrl, {throwHttpErrors: false})
    expect(badResponse.statusCode).toBe(400)
    expect(badResponse.body).toContain('Missing token')

    // The server is still up: a follow-up request with the same state now succeeds.
    await got(`${callbackUrl}&token=abc123`)
    await run
  })
})
