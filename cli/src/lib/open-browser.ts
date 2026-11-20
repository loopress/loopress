import open from 'open'

/** Opens `url` in the user's default browser, best-effort. */
export function openBrowser(url: string): void {
  open(url).catch(() => {
    // Best effort: the caller prints the URL too, so a missing browser is not an error.
  })
}
