// `lps push`/`pull`/`promote --json` must put exactly one JSON document on stdout: that's what
// the MCP server (and any script) parses. The resource commands they delegate to aren't in JSON
// mode themselves, so their progress lines and Listr renderers would land on stdout ahead of it.
// While `enabled`, their stdout goes to stderr instead: still visible to a human, out of the
// JSON. Patching the stream's write is the one place every writer goes through (oclif's
// ux.stdout, Listr's renderers, a stray console.log).
export async function stdoutToStderr<T>(enabled: boolean, work: () => Promise<T>): Promise<T> {
  if (!enabled) return work()

  const original = process.stdout.write
  process.stdout.write = process.stderr.write.bind(process.stderr)
  try {
    return await work()
  } finally {
    process.stdout.write = original
  }
}
