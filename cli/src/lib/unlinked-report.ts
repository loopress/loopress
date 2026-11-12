import {ux} from '@oclif/core'

// Deployment records and drift reports are best effort and stay silent on failure, except for
// one case worth telling: the account answers 404 when no environment matches the site URL,
// which `lps project link` fixes.
export function warnIfUnlinked(error: unknown, url: string): void {
  if (typeof error !== 'object' || error === null || !('response' in error)) return
  const {response} = error
  if (typeof response !== 'object' || response === null || !('statusCode' in response) || response.statusCode !== 404) return

  ux.warn(`Not recorded on your Loopress account: no environment matches ${url}. Run \`lps project link\`.`)
}
