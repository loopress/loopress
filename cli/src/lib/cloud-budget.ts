// The cloud is best effort (a developer's push or diff never waits on it for long): every cloud
// call of one run (the deployment record, the drift report) draws from the same budget, so a
// slow cloud costs the run this much once, not once per call.
export const CLOUD_BUDGET_MS = 3000

let spent = 0

// The time the next cloud call may take, or 0 when the run already used its budget (skip it).
export function cloudTimeoutMs(): number {
  return Math.max(0, CLOUD_BUDGET_MS - spent)
}

// Runs one cloud call within what is left of the run's budget and charges what it took.
// Resolves to undefined when the budget is spent; the call's own errors propagate.
export async function withCloudBudget<T>(call: (timeoutMs: number) => Promise<T>): Promise<T | undefined> {
  const timeoutMs = cloudTimeoutMs()
  if (timeoutMs === 0) return undefined
  const start = Date.now()
  try {
    return await call(timeoutMs)
  } finally {
    spent += Date.now() - start
  }
}

export function resetCloudBudget(): void {
  spent = 0
}
