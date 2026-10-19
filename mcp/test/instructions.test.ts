import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

import {SERVER_INSTRUCTIONS} from '../src/instructions.js'

const DOCS = fileURLToPath(new URL('../../documentation/src/content/docs', import.meta.url))

describe('SERVER_INSTRUCTIONS', () => {
  // A renamed doc page would otherwise send every agent to a 404 for that resource's format.
  it('links only doc pages that exist', () => {
    const slugs = [...SERVER_INSTRUCTIONS.matchAll(/https:\/\/docs\.loopress\.dev\/([\w/-]+)\//g)].map((m) => m[1])
    expect(slugs.length).toBeGreaterThan(10)
    const missing = slugs.filter((slug) => !['.md', '.mdx', '/index.md', '/index.mdx'].some((ext) => existsSync(join(DOCS, slug + ext))))
    expect(missing).toEqual([])
  })
})
