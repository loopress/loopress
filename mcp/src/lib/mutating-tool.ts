import {consumeConfirmation, createConfirmation} from './confirm-tokens.js'
import {LpsError, RunLpsOptions, runLps} from './run-lps.js'

export interface MutatingToolResult {
  confirmToken?: string
  error?: LpsError
  expiresAt?: string
  preview?: unknown
  result?: unknown
  status: 'applied' | 'error' | 'preview'
}

// Every mutating tool (anything that reaches a real WordPress site) follows the same two-call
// handshake: no confirmToken -> a --dry-run preview plus a single-use token; confirmToken -> the
// real run, using the args captured at preview time (not whatever the caller resends), so what
// gets applied can never drift from what was previewed. There is deliberately no parameter to
// skip straight to "applied" in one call, not even for production: the preview step is never
// bypassable at this layer because no tool schema exposes such a flag.
export async function runMutatingTool(
  tool: string,
  args: string[],
  confirmToken?: string,
  options?: RunLpsOptions,
): Promise<MutatingToolResult> {
  if (!confirmToken) {
    // oclif expects the topic/command first; the flag has to come after it, not before.
    const preview = await runLps([...args, '--dry-run'], options)
    if (!preview.ok) return {error: preview.error, status: 'error'}

    const token = createConfirmation(tool, args)
    return {confirmToken: token.confirmToken, expiresAt: token.expiresAt, preview: preview.data, status: 'preview'}
  }

  const consumed = consumeConfirmation(tool, confirmToken)
  if (!consumed.ok) return {error: consumed.error, status: 'error'}

  const result = await runLps(consumed.args, options)
  if (!result.ok) return {error: result.error, status: 'error'}

  return {result: result.data, status: 'applied'}
}
