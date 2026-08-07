import got from 'got'
import {createWriteStream} from 'node:fs'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pipeline} from 'node:stream/promises'

const REPO = 'loopress/loopress'
const RELEASE_TAG_PATTERN = /^wordpress-plugin@/
const ASSET_NAME = 'loopress-full.zip'

type GithubAsset = {
  browser_download_url: string
  name: string
}

type GithubRelease = {
  assets: GithubAsset[]
  tag_name: string
}

/**
 * Downloads `loopress-full.zip` from the most recent `wordpress-plugin@*` release of
 * `loopress/loopress`, returning the local path to the downloaded file.
 *
 * `releases/latest` isn't used on purpose: this repo's releases interleave
 * `wordpress-plugin@X.Y.Z` and `@loopress/cli@X.Y.Z` tags, so "latest" can be a CLI release
 * with no plugin assets at all. Every `wordpress-plugin@*` release always ships both
 * `loopress-full.zip` and `loopress-light.zip`, so the asset is matched by exact name, not by
 * "the one zip asset".
 */
export async function downloadLatestFullZip(): Promise<string> {
  const releases = await got(`https://api.github.com/repos/${REPO}/releases`, {
    headers: {accept: 'application/vnd.github+json', 'user-agent': 'loopress-cli'},
    searchParams: {'per_page': 30},
  }).json<GithubRelease[]>()

  const pluginRelease = releases.find((release) => release.tag_name.startsWith("wordpress-plugin@"))
  if (!pluginRelease) {
    throw new Error(`No "wordpress-plugin@*" release found in ${REPO}.`)
  }

  const asset = pluginRelease.assets.find((candidate) => candidate.name === ASSET_NAME)
  if (!asset) {
    throw new Error(`Release "${pluginRelease.tag_name}" has no "${ASSET_NAME}" asset.`)
  }

  const dir = await mkdtemp(join(tmpdir(), 'lps-loopress-full-'))
  const zipPath = join(dir, ASSET_NAME)

  await pipeline(got.stream(asset.browser_download_url), createWriteStream(zipPath))

  return zipPath
}
