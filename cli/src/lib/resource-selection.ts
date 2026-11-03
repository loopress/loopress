import {Flags} from '@oclif/core'

// One singular id per resource, shared by every command taking `--only` / `--skip`
// (`lps dev`, `lps diff`, `lps push`). Each command accepts the subset it can act on.
export const RESOURCE_IDS = [
  'plugin',
  'composer',
  'cpt',
  'taxonomy',
  'meta',
  'role',
  'acf',
  'api',
  'hook',
  'block',
  'form',
  'pattern',
  'template',
  'part',
  'css',
  'theme-style',
  'page',
  'menu',
  'option',
  'snippet',
] as const

export type ResourceId = (typeof RESOURCE_IDS)[number]

// Comma-separated or repeated: `--only a,b`, `--only a --only b`, or both.
export function selectionFlags(noun: string, valid: readonly string[]): {only: ReturnType<typeof Flags.string>; skip: ReturnType<typeof Flags.string>} {
  return {
    only: Flags.string({description: `Only ${noun} these resources (comma-separated or repeated): ${valid.join(', ')}`, multiple: true}),
    skip: Flags.string({description: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} every resource except these (comma-separated or repeated)`, multiple: true}),
  }
}

// Splits the raw flag values and rejects any id outside `valid`.
export function parseSelectionFlag(raw: string[] | undefined, flagName: 'only' | 'skip', valid: readonly string[], fail: (message: string) => never): string[] {
  return (raw ?? [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (!valid.includes(value)) fail(`Unknown resource "${value}" in --${flagName}. Valid resources: ${valid.join(', ')}`)
      return value
    })
}

// `only` narrows `all`, `skip` then removes from whatever that is, so a combined
// `--only=a,b --skip=b` reads as: a, b, then drop b. The result always follows `all`'s order.
export function selectResources<T extends string>(all: readonly T[], only: readonly string[] = [], skip: readonly string[] = []): T[] {
  return all.filter((id) => (only.length === 0 || only.includes(id)) && !skip.includes(id))
}
