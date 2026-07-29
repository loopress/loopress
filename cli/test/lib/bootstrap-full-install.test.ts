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
  return {close: vi.fn().mockResolvedValue(), newPage: vi.fn().mockResolvedValue(page)}
}

describe('bootstrapLoopressFull', () => {
  const wp = {} as WpClient
  const admin = {id: 7, password: 'x', username: 'lps-temp-abc'}
  const log = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    downloadLatestFullZipMock.mockResolvedValue('/tmp/lps-loopress-full-xyz/loopress-full.zip')
    createTempAdminMock.mockResolvedValue(admin)
    deleteTempAdminMock.mockResolvedValue()
  })

  it('installs successfully and always cleans up the temp admin', async () => {
    launchLocalBrowserMock.mockResolvedValue(fakeWorkingBrowser())

    await expect(bootstrapLoopressFull(wp, 'https://example.com', log)).resolves.toBeUndefined()

    expect(deleteTempAdminMock).toHaveBeenCalledWith(wp, admin)
    expect(log).toHaveBeenCalledWith('Loopress Full installed and activated.')
  })

  it('falls back to manual instructions when the install fails, and still cleans up', async () => {
    launchLocalBrowserMock.mockRejectedValue(new Error('No local browser found.'))

    await expect(bootstrapLoopressFull(wp, 'https://example.com', log)).rejects.toThrow(
      /Could not install Loopress Full automatically\..*upload \/tmp\/lps-loopress-full-xyz\/loopress-full\.zip at https:\/\/example\.com\/wp-admin\/plugin-install\.php\?tab=upload/s,
    )
    expect(deleteTempAdminMock).toHaveBeenCalledWith(wp, admin)
  })

  it('surfaces both failures when the install fails and cleanup also fails', async () => {
    launchLocalBrowserMock.mockRejectedValue(new Error('No local browser found.'))
    deleteTempAdminMock.mockRejectedValue(new Error('Temporary admin account "lps-temp-abc" (id 7) still exists.'))

    await expect(bootstrapLoopressFull(wp, 'https://example.com', log)).rejects.toThrow(
      /Could not install Loopress Full automatically, and the temporary admin account could not be removed.*still exists/s,
    )
  })

  it('surfaces the cleanup failure alone when install succeeds but cleanup fails', async () => {
    launchLocalBrowserMock.mockResolvedValue(fakeWorkingBrowser())
    deleteTempAdminMock.mockRejectedValue(new Error('Temporary admin account "lps-temp-abc" (id 7) still exists.'))

    await expect(bootstrapLoopressFull(wp, 'https://example.com', log)).rejects.toThrow(/still exists/)
  })
})
