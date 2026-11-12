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
// The environment a call names: `--env <name>` (resource push/rm/rollback) or promote's destination
// positional (`promote <from> <to>`). Undefined when the call leaves it to the project's default.
function namedEnvironment(args: string[]): string | undefined {
  if (args[0] === 'promote') return args[2]
  const envIndex = args.indexOf('--env')
  return envIndex === -1 ? undefined : args[envIndex + 1]
}

const PRODUCTION_BLOCKED: MutatingToolResult = {
  error: {
    message:
      'Refusing to change an environment of type "production" from the MCP server: there is no human confirmation on this path. ' +
      'Run this command with the lps CLI, where production changes are confirmed interactively.',
    name: 'PRODUCTION_BLOCKED',
  },
  status: 'error',
}

// Production is what the environment's configured type says, never what it is called: ask the CLI
// (`lps status`) which environment this call would change and what type it has. Without `--env`,
// lps targets the project's default environment ("local", or its only one), which can be production:
// it is pinned as `--env <name>`, so the refusal also covers the implicit case (otherwise `--yes` on
// rm/rollback/prune would reach production unconfirmed) and the confirmed call hits the environment
// that was previewed, even if the configuration changes in between. promote names both environments,
// so it never needs the pin.
async function resolveTarget(
  args: string[],
): Promise<{args: string[]; isProduction: boolean; ok: true} | {error: LpsError; ok: false}> {
  const named = namedEnvironment(args)
  const status = await runLps<{environment?: string; environmentType?: string; note?: string}>(
    named === undefined ? ['status'] : ['status', '--env', named],
  )
  if (!status.ok) return status

  const {environment, environmentType, note} = status.data ?? {}
  if (!environment) {
    return {
      error: {
        message: `Could not tell which environment this would change${note ? ` (${note})` : ''}. Pass env explicitly.`,
        name: 'UNRESOLVED_ENVIRONMENT',
      },
      ok: false,
    }
  }

  // Fail closed: an environment without a type might be production.
  if (!environmentType) {
    return {
      error: {
        message: `The environment "${environment}" has no type, so it can't be told apart from production. Run \`lps project config\` to set it.`,
        name: 'UNRESOLVED_ENVIRONMENT',
      },
      ok: false,
    }
  }

  const pinned = named !== undefined || args[0] === 'promote' ? args : [...args, '--env', environment]
  return {args: pinned, isProduction: environmentType === 'production', ok: true}
}

export async function runMutatingTool(
  tool: string,
  args: string[],
  confirmToken?: string,
  options?: RunLpsOptions,
): Promise<MutatingToolResult> {
  // Production (an environment of type "production") is CLI-only. The confirmToken handshake
  // protects against drift, not against an autonomous or prompt-injected agent replaying its own token, and `--yes` (which resource
  // rm/rollback/prune and promote pass) otherwise bypasses the CLI's production confirmation
  // entirely. Refuse any production-targeting mutation here so a human must run it via `lps`,
  // where the change is confirmed interactively. Non-production environments are unaffected.
  if (!confirmToken) {
    const target = await resolveTarget(args)
    if (!target.ok) return {error: target.error, status: 'error'}
    if (target.isProduction) return PRODUCTION_BLOCKED
    // The token stores these pinned args, so the confirmed call needs no second check.
    args = target.args

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
