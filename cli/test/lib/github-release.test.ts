import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {gotFn, gotJson, gotStream} = vi.hoisted(() => {
  const gotJson = vi.fn()
  const gotStream = vi.fn()
  const gotFn = Object.assign(
    vi.fn((_url: string, _options: unknown) => ({json: () => gotJson()})),
    {stream: gotStream},
  )
  return {gotFn, gotJson, gotStream}
})

vi.mock('got', () => ({default: gotFn}))

const {downloadLatestFullZip} = await import('../../src/lib/github-release.js')

describe('downloadLatestFullZip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('picks the latest wordpress-plugin@* release, ignoring interleaved cli releases, and downloads loopress-full.zip', async () => {
    gotJson.mockResolvedValue([
      {assets: [], 'tag_name': '@loopress/cli@0.19.0'},
      {
        assets: [
          {'browser_download_url': 'https://example.com/loopress-full.zip', name: 'loopress-full.zip'},
          {'browser_download_url': 'https://example.com/loopress-light.zip', name: 'loopress-light.zip'},
        ],
        'tag_name': 'wordpress-plugin@2026.7.15',
      },
    ])
    gotStream.mockReturnValue(Readable.from([Buffer.from('zip-bytes')]))

    const zipPath = await downloadLatestFullZip()

    expect(gotStream).toHaveBeenCalledWith('https://example.com/loopress-full.zip')
    expect(zipPath.endsWith('loopress-full.zip')).toBe(true)
    await expect(readFile(zipPath, 'utf8')).resolves.toBe('zip-bytes')
  })

  it('throws when no wordpress-plugin@* release exists (e.g. the most recent release is a CLI release)', async () => {
    gotJson.mockResolvedValue([{assets: [], 'tag_name': '@loopress/cli@0.19.0'}])

    await expect(downloadLatestFullZip()).rejects.toThrow(/No "wordpress-plugin@\*" release found/)
  })

  it('throws when the matching release has no loopress-full.zip asset', async () => {
    gotJson.mockResolvedValue([
      {
        assets: [{'browser_download_url': 'https://example.com/loopress-light.zip', name: 'loopress-light.zip'}],
        'tag_name': 'wordpress-plugin@2026.7.15',
      },
    ])

    await expect(downloadLatestFullZip()).rejects.toThrow(/no "loopress-full\.zip" asset/)
  })
})
