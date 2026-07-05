import {vi} from 'vitest'

export interface FakeListrOptions {
  exitOnError?: boolean
}

export interface FakeListrTask {
  task: (ctx: Record<string, unknown>, task: {output: string}) => Promise<void> | void
  title: string
}

export interface FakeListrInstance {
  options: FakeListrOptions
  outputs: string[]
  tasks: FakeListrTask[]
}

// Module-level and shared across every file that imports this helper. Any suite using
// createListrMock() must call resetListrInstances() in its beforeEach, or instances pushed
// by an earlier test (in this file or another) will shift the indices titlesOf()/outputsOf()
// read from.
export const listrInstances: FakeListrInstance[] = []

export function resetListrInstances(): void {
  listrInstances.length = 0
}

export function titlesOf(instanceIndex: number): string[] {
  return listrInstances[instanceIndex].tasks.map((t) => t.title)
}

export function outputsOf(instanceIndex: number): string[] {
  return listrInstances[instanceIndex].outputs
}

// The real Listr renderer swallows task output/titles, making them unobservable to assertions.
// This fake keeps `run()`'s "continue past a failed task" semantics (matching `exitOnError: false`)
// while exposing each task's title and output so tests can pin down the exact copy shown.
// Use in any suite that drives a Listr-based command through its public `run()` instead of
// unit-testing the per-item task method directly. `vi.mock` factories are hoisted above
// imports, so reference this via a dynamic import rather than importing `createListrMock`
// at the top of the file:
//   vi.mock('listr2', async () => {
//     const {createListrMock} = await import('../../helpers/listr.js')
//     return createListrMock()
//   })
export function createListrMock() {
  return {
    Listr: vi.fn().mockImplementation(function (
      this: FakeListrInstance & {run: (ctx?: Record<string, unknown>) => Promise<unknown>},
      tasks: FakeListrTask[],
      options: FakeListrOptions,
    ) {
      this.options = options
      this.tasks = tasks
      this.outputs = []
      this.run = async (ctx: Record<string, unknown> = {}) => {
        for (const t of tasks) {
          const fakeTask = {output: ''}
          try {
            await t.task(ctx, fakeTask)
          } catch (error) {
            if (options?.exitOnError) throw error
          } finally {
            this.outputs.push(fakeTask.output)
          }
        }

        return ctx
      }

      listrInstances.push(this)
    }),
  }
}
