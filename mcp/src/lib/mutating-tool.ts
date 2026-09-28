import {consumeConfirmation, createConfirmation} from './confirm-tokens.js'
import {fingerprintPreview} from './preview-fingerprint.js'
import {LpsError, RunLpsOptions, runLps} from './run-lps.js'
import {createSnapshot, removeSnapshot} from './snapshot.js'

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
// real run, using the args captured at preview time (not whatever the caller resends). Both
// calls run from a frozen copy of the working tree taken at preview time, so the bytes that
// get pushed cannot drift from what was previewed even if a file is swapped in between (F28).
// There is deliberately no parameter to skip straight to "applied" in one call, not even for
// production: the preview step is never bypassable at this layer because no tool schema exposes
// such a flag.
//
// F28 only freezes the local side. A command's own --dry-run can also read live remote state
// (rollback's drift check does), and that can move between the preview call and the confirmed
// one. So the confirmed call re-runs the same --dry-run once more, from the same frozen local
// files, right before applying: if the command's own preview output hasn't changed, whatever it
// inspects on the remote side hasn't moved either, and applying is safe; if it has, the confirm
// is refused rather than silently overwriting whatever changed in between (see #232).
// True when the lps args target an environment named "production", either via `--env production`
// (resource push/rm/rollback) or as promote's destination positional (`promote <from> <to>`).
function targetsProduction(args: string[]): boolean {
  const isProduction = (value?: string): boolean => value?.toLowerCase() === 'production'

  const envIndex = args.indexOf('--env')
  if (envIndex !== -1 && isProduction(args[envIndex + 1])) return true

  // `promote <from> <to>`: the destination is the second positional after the command.
  return args[0] === 'promote' && isProduction(args[2])
}

export async function runMutatingTool(
  tool: string,
  args: string[],
  confirmToken?: string,
  options?: RunLpsOptions,
): Promise<MutatingToolResult> {
  // Production is CLI-only. The confirmToken handshake protects against drift, not against an
  // autonomous or prompt-injected agent replaying its own token, and `--yes` (which resource
  // rm/rollback/prune and promote pass) otherwise bypasses the CLI's production confirmation
  // entirely. Refuse any production-targeting mutation here so a human must run it via `lps`,
  // where the change is confirmed interactively. Non-production environments are unaffected.
  if (targetsProduction(args)) {
    return {
      error: {
        message:
          'Refusing to change the "production" environment from the MCP server: there is no human confirmation on this path. ' +
          'Run this command with the lps CLI, where production changes are confirmed interactively.',
        name: 'PRODUCTION_BLOCKED',
      },
      status: 'error',
    }
  }

  if (!confirmToken) {
    const snapshotDir = await createSnapshot(process.cwd())

    // oclif expects the topic/command first; the flag has to come after it, not before.
    const preview = await runLps([...args, '--dry-run'], {...options, cwd: snapshotDir})
    if (!preview.ok) {
      removeSnapshot(snapshotDir)
      return {error: preview.error, status: 'error'}
    }

    const token = createConfirmation(tool, args, snapshotDir, fingerprintPreview(preview.data))
    return {confirmToken: token.confirmToken, expiresAt: token.expiresAt, preview: preview.data, status: 'preview'}
  }

  const consumed = consumeConfirmation(tool, confirmToken)
  if (!consumed.ok) return {error: consumed.error, status: 'error'}

  const revalidation = await runLps([...consumed.args, '--dry-run'], {...options, cwd: consumed.snapshotDir})
  if (!revalidation.ok) {
    removeSnapshot(consumed.snapshotDir)
    return {error: revalidation.error, status: 'error'}
  }

  if (fingerprintPreview(revalidation.data) !== consumed.previewFingerprint) {
    removeSnapshot(consumed.snapshotDir)
    return {
      error: {
        message:
          'The environment changed since this preview was generated, so this confirmToken is stale. ' +
          'Call the tool again without a confirmToken for a fresh preview.',
        name: 'STALE_PREVIEW',
      },
      status: 'error',
    }
  }

  const result = await runLps(consumed.args, {...options, cwd: consumed.snapshotDir})
  removeSnapshot(consumed.snapshotDir)
  if (!result.ok) return {error: result.error, status: 'error'}

  return {result: result.data, status: 'applied'}
}
