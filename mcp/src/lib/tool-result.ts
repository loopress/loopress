import {LpsError, LpsResult} from './run-lps.js'

// A read-only tool's payload: the CLI's own JSON on success, or its error envelope on failure.
export function unwrap<T>(result: LpsResult<T>): {error: LpsError} | T {
  return result.ok ? result.data : {error: result.error}
}

export function toCallToolResult(payload: unknown): {content: Array<{text: string; type: 'text'}>; isError: boolean} {
  const isError = Boolean(payload && typeof payload === 'object' && 'error' in payload)
  return {content: [{text: JSON.stringify(payload, null, 2), type: 'text'}], isError}
}
