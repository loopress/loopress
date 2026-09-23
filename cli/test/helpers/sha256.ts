import {createHash} from 'node:crypto'

// Matches AbstractFilesController::revisionOf() and OptionsService::revisionOf(): a plain
// sha256 content hash, never a security control, just a change-detection tag compared for
// equality (#234). Shared here so api/hook push tests don't each reimplement it identically.
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
