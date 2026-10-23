import {stripVTControlCharacters} from 'node:util'
import {afterEach, describe, expect, it} from 'vitest'

import {DiffCommand, type DiffJson, type DiffTarget} from '../../src/lib/diff-command.js'
import {type ResourceState} from '../../src/lib/diff-state.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

class TestReport extends DiffCommand {
  static enableJsonFlag = true
  targets: DiffTarget[] = []

  async run(): Promise<DiffJson> {
    this.siteConfig = makeEnv('staging')
    return this.report(this.targets, this.resolveSides(undefined))
  }

  sides() {
    this.siteConfig = makeEnv('staging')
    return this.resolveSides(undefined)
  }
}

const state = (entries: Record<string, unknown>): ResourceState => new Map(Object.entries(entries))

function target(title: string, left: Error | Record<string, unknown>, right: Record<string, unknown> = {}, optional = false): DiffTarget {
  return {
    async left() {
      if (left instanceof Error) throw left
      return state(left)
    },
    optional,
    resource: title.toLowerCase(),
    right: async () => state(right),
    title,
  }
}

async function report(targets: DiffTarget[], argv: string[] = []) {
  const cmd = new TestReport(argv, fakeOclifConfig)
  cmd.targets = targets
  const logs = silenceLogs(cmd)
  const result = await cmd.run()
  const lines = logs.log.mock.calls.flatMap(([text]) => stripVTControlCharacters(String(text)).split('\n'))
  return {lines, result}
}

describe('DiffCommand.report', () => {
  afterEach(() => {
    process.exitCode = undefined
  })

  it('renders every section, skipped resource and the tally, and exits 1 on drift', async () => {
    const {lines, result} = await report([
      target('Snippets', {a: 1, b: {x: 1}, gone: 1}, {a: 1, b: {x: 2}, new: 1}),
      target('Forms', {f: 1}, {f: 1}),
      target('ACF', new Error('Advanced Custom Fields is not active'), {}, true),
    ])

    expect(lines).toEqual([
      'Comparing staging → local files',
      '',
      'Snippets',
      '  + new',
      '  - gone',
      '  ~ b',
      expect.stringMatching(/^ {4}\S/),
      'Forms  in sync',
      'ACF  not configured, skipped',
      '',
      '2 compared: 1 changed, 1 added, 1 removed',
      'Drift detected.',
    ])
    expect(result.drift).toBe(true)
    expect(result.left).toBe('staging')
    expect(result.right).toBe('local')
    expect(Object.keys(result.resources)).toEqual(['snippets', 'forms'])
    expect(process.exitCode).toBe(1)
  })

  it('says everything is in sync and leaves the exit code alone', async () => {
    const {lines, result} = await report([target('Forms', {f: 1}, {f: 1})])

    expect(lines.slice(-2)).toEqual(['1 compared: 0 changed, 0 added, 0 removed', 'Everything is in sync.'])
    expect(result.drift).toBe(false)
    expect(process.exitCode).toBeUndefined()
  })

  it('names each failure on its own line and exits 2', async () => {
    const {lines, result} = await report([
      target('Snippets', new Error('boom')),
      target('Forms', new Error('bang')),
      target('Menus', {m: 1}, {}),
    ])

    expect(lines).toContain('Snippets  error: boom')
    expect(lines).toContain('Forms  error: bang')
    expect(lines).toContain('1 compared: 0 changed, 0 added, 1 removed')
    expect(lines.at(-1)).toBe('Some resources could not be compared; this run is inconclusive.')
    expect(result.resources.snippets).toEqual({added: [], changed: [], error: 'boom', removed: []})
    expect(process.exitCode).toBe(2)
  })

  it('prints a failure shared by several resources once, naming them', async () => {
    const {lines} = await report([target('Snippets', new Error('site down')), target('Forms', new Error('site down')), target('Menus', {}, {})])

    expect(lines).toContain('error (Snippets, Forms): site down')
    expect(lines.filter((line) => line.includes('site down'))).toHaveLength(1)
  })

  it('reports a single failure on its own line, not as shared', async () => {
    const {lines} = await report([target('Snippets', new Error('boom')), target('Forms', {}, {})])

    expect(lines).toContain('Snippets  error: boom')
    expect(lines.some((line) => line.startsWith('error ('))).toBe(false)
  })

  it('keeps a missing plugin as a failure when the resource is not optional', async () => {
    const {result} = await report([target('ACF', new Error('Advanced Custom Fields is not active'))])

    expect(result.resources.acf.error).toBe('Advanced Custom Fields is not active')
    expect(process.exitCode).toBe(2)
  })

  it('prints nothing in --json mode', async () => {
    const {lines} = await report([target('Forms', {f: 1}, {})], ['--json'])

    expect(lines).toEqual([])
  })

  it('indents a multi-line patch under its id, leaving blank lines empty', async () => {
    const {lines} = await report([target('Api', {route: 'a\n\nb\n'}, {route: 'a\n\nc\n'})])

    const start = lines.indexOf('  ~ route')
    const patch = lines.slice(start + 1, lines.indexOf('', start + 1))
    expect(patch.length).toBeGreaterThan(1)
    for (const line of patch) expect(line).toMatch(/^ {4}/)
    expect(lines.slice(start + 1).includes(' '.repeat(4))).toBe(false)
  })

  it('forwards provider warnings to warn()', () => {
    const cmd = new TestReport([], fakeOclifConfig)
    const logs = silenceLogs(cmd)

    cmd.sides().warn('careful')

    expect(logs.warn).toHaveBeenCalledWith('careful')
  })
})
