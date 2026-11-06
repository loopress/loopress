import {rename} from 'node:fs/promises'
import {setTimeout as sleep} from 'node:timers/promises'

const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM'])

// On Windows, an editor, an antivirus or the search indexer can briefly hold a file open and make
// rename() fail with EPERM/EBUSY. Those clear within milliseconds, so retry a few times with a
// growing delay before giving up. Other errors (ENOENT, EEXIST...) are thrown right away.
export async function renameWithRetry(from: string, to: string, attempts = 5, baseDelayMs = 50): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
       
      await rename(from, to)
      return
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : ''
      if (!RETRYABLE_CODES.has(code) || attempt >= attempts) throw error
       
      await sleep(baseDelayMs * attempt)
    }
  }
}
