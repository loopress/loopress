import ciInfo from 'ci-info'

// The one place the CLI asks "are we in CI?", so tests can stub it. Detection is delegated to
// `ci-info` (the library npm itself uses): it knows the env vars of every major provider and is
// kept up to date, so the CLI keeps no list of its own.

// Any CI signal, including a bare `CI=true`. Enough to stop prompting, not to authorize anything.
// Read from the environment at call time (`ci-info` snapshots it at import).
export function isCi(): boolean {
  return Boolean(process.env.CI)
}

// A recognized CI provider (GitHub Actions, GitLab CI, CircleCI...), not just `CI=true`. This is
// what lets `--yes` write to an environment of type "production" from a non-interactive run.
export function isKnownCiProvider(): boolean {
  return ciInfo.isCI && ciInfo.name !== null
}
