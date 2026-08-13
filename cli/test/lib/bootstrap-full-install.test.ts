import {beforeEach, describe, expect, it, vi} from 'vitest'

import {type WpClient} from '../../src/lib/wp-client.js'

const {createTempAdminMock, deleteTempAdminMock, downloadLatestFullZipMock, launchLocalBrowserMock} = vi.hoisted(
  () => ({
    createTempAdminMock: vi.fn(),
    deleteTempAdminMock: vi.fn(),
    downloadLatestFullZipMock: vi.fn(),
    launchLocalBrowserMock: vi.fn(),
  }),
)

vi.mock('../../src/lib/github-release.js', () => ({downloadLatestFullZip: downloadLatestFullZipMock}))
vi.mock('../../src/lib/temp-admin.js', () => ({
  createTempAdmin: createTempAdminMock,
  deleteTempAdmin: deleteTempAdminMock,
}))
vi.mock('../../src/lib/browser-launch.js', () => ({launchLocalBrowser: launchLocalBrowserMock}))

const {bootstrapLoopressFull} = await import('../../src/lib/bootstrap-full-install.js')

function fakeWorkingBrowser() {
  const element = {click: vi.fn().mockResolvedValue()}
  const page = {
    click: vi.fn().mockResolvedValue(),
    fill: vi.fn().mockResolvedValue(),
    goto: vi.fn().mockResolvedValue(),
    setInputFiles: vi.fn().mockResolvedValue(),
    waitForLoadState: vi.fn().mockResolvedValue(),
    waitForSelector: vi.fn().mockResolvedValue(element),
  }
  const browser = {close: vi.fn().mockResolvedValue(), newPage: vi.fn().mockResolvedValue(page)}
  return {browser, element, page}
}

describe('bootstrapLoopressFull', () => {
  const wp = {} as unknown as WpClient
  const admin = {id: 7, password: 'x', username: 'lps-temp-abc'}
  const log = vi.fn<(message: string) => void>()

  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line sonarjs/publicly-writable-directories -- mocked return value, never written to disk
    downloadLatestFullZipMock.mockResolvedValue('/tmp/lps-loopress-full-xyz/loopress-full.zip')
    createTempAdminMock.mockResolvedValue(admin)
    deleteTempAdminMock.mockResolvedValue()
  })

  it('installs successfully and always cleans up the temp admin', async () => {
    const {browser, element, page} = fakeWorkingBrowser()
    launchLocalBrowserMock.mockResolvedValue(browser)

    await expect(bootstrapLoopressFull(wp, 'https://example.com', log)).resolves.toBeUndefined()

    expect(deleteTempAdminMock).toHaveBeenCalledWith(wp, admin)
    expect(log).toHaveBeenCalledWith('Downloading the latest Loopress Full release...')
    expect(log).toHaveBeenCalledWith('Creating a temporary admin account to install it...')
    expect(log).toHaveBeenCalledWith('Installing and activating Loopress Full...')
    expect(log).toHaveBeenCalledWith('Loopress Full installed and activated.')
    expect(log).toHaveBeenCalledWith('Removing the temporary admin account...')

    expect(page.goto).toHaveBeenNthCalledWith(1, 'https://example.com/wp-login.php', {waitUntil: 'domcontentloaded'})
    expect(page.fill).toHaveBeenCalledWith('#user_login', 'lps-temp-abc')
    expect(page.fill).toHaveBeenCalledWith('#user_pass', 'x')
    expect(page.click).toHaveBeenCalledWith('#wp-submit')

    expect(page.goto).toHaveBeenNthCalledWith(2, 'https://example.com/wp-admin/plugin-install.php?tab=upload', {
      waitUntil: 'domcontentloaded',
    })
    expect(page.setInputFiles).toHaveBeenCalledWith('#pluginzip', '/tmp/lps-loopress-full-xyz/loopress-full.zip')
    expect(page.click).toHaveBeenCalledWith('input[name="install-plugin-submit"]')

    expect(page.waitForSelector).toHaveBeenCalledWith('a[href*="action=activate"]', {timeout: 15_000})
    expect(element.click).toHaveBeenCalled()

    // waitForLoadState('domcontentloaded') is called 3 times (after login, after plugin upload,
    // after activation); assert every call individually so a mutated call (e.g. '') can't hide
    // behind the other two still passing the right argument.
    expect(page.waitForLoadState.mock.calls).toEqual([['domcontentloaded'], ['domcontentloaded'], ['domcontentloaded']])

    expect(browser.close).toHaveBeenCalled()
  })

  it('falls back to manual instructions when the install fails, and still cleans up', async () => {
    launchLocalBrowserMock.mockRejectedValue(new Error('No local browser found.'))

    const error: Error = await bootstrapLoopressFull(wp, 'https://example.com', log).catch((error_: Error) => error_)

    expect(error.message).toMatch(
      /Could not install Loopress Full automatically\..*upload \/tmp\/lps-loopress-full-xyz\/loopress-full\.zip at https:\/\/example\.com\/wp-admin\/plugin-install\.php\?tab=upload/s,
    )
    expect(error.cause).toBeInstanceOf(Error)
    expect((error.cause as Error).message).toBe('No local browser found.')
    expect(deleteTempAdminMock).toHaveBeenCalledWith(wp, admin)
    expect(log).not.toHaveBeenCalledWith('Loopress Full installed and activated.')
  })

  it('surfaces both failures when the install fails and cleanup also fails', async () => {
    launchLocalBrowserMock.mockRejectedValue(new Error('No local browser found.'))
    deleteTempAdminMock.mockRejectedValue(new Error('Temporary admin account "lps-temp-abc" (id 7) still exists.'))

    const error: Error = await bootstrapLoopressFull(wp, 'https://example.com', log).catch((error_: Error) => error_)

    expect(error.message).toMatch(
      /Could not install Loopress Full automatically, and the temporary admin account could not be removed.*still exists/s,
    )
    expect(error.cause).toBeInstanceOf(Error)
    expect((error.cause as Error).message).toBe('No local browser found.')
  })

  it('surfaces the cleanup failure alone when install succeeds but cleanup fails', async () => {
    const {browser} = fakeWorkingBrowser()
    launchLocalBrowserMock.mockResolvedValue(browser)
    deleteTempAdminMock.mockRejectedValue(new Error('Temporary admin account "lps-temp-abc" (id 7) still exists.'))

    await expect(bootstrapLoopressFull(wp, 'https://example.com', log)).rejects.toThrow(/still exists/)
  })
})
