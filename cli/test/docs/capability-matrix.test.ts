import {existsSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

import {RESOURCE_TYPES} from '../../src/lib/dev-watch.js'

const here = dirname(fileURLToPath(import.meta.url))
const cliRoot = resolve(here, '../..')
const commandsDir = join(cliRoot, 'src/commands')
const workflowDoc = join(cliRoot, '../documentation/src/content/docs/workflow.md')
const pluginRoot = join(cliRoot, '../wordpress-plugin')

const {deriveFullOnlyFeatures} = createRequire(import.meta.url)(join(pluginRoot, 'scripts/build-flavor.cjs')) as {
  deriveFullOnlyFeatures: (root: string) => string[]
}

type Column = 'diff' | 'pull' | 'push' | 'rollback'

type Spec = {
  // The resource's `dev` watch types (cli/src/lib/dev-watch.ts).
  dev?: string[]
  // Directory of cli/src/commands holding the resource's own pull/push/diff/rollback files.
  dir: string
  // Substring of cli/src/lib/eject.ts naming the resource, for the rows that eject refuses.
  ejectLabel?: string
  // The plugin src/ directory providing it, Full when it is in the Full-only list.
  module: string
  // Columns the aggregate commands cover without a per-resource file, or not checked against one.
  unchecked?: Column[]
}

// Keyed by the row's link text in the table.
const RESOURCES: Record<string, Spec> = {
  ACF: {dir: 'acf', module: 'Acf'},
  'API routes': {dev: ['api'], dir: 'api', ejectLabel: 'API routes (api/)', module: 'Api'},
  Composer: {dir: 'composer', ejectLabel: 'composer.json', module: 'Dependencies', unchecked: ['diff']},
  'Custom post types': {dir: 'cpt', module: 'PostTypes'},
  'Block patterns': {dir: 'pattern', module: 'Pages'},
  'Dynamic blocks': {dev: ['block'], dir: 'block', ejectLabel: 'dynamic blocks (blocks/)', module: 'Blocks'},
  Forms: {dir: 'form', module: 'Form'},
  Hooks: {dev: ['hook'], dir: 'hook', module: 'Hooks'},
  Menus: {dir: 'menu', module: 'Menu'},
  Options: {dir: 'option', module: 'Options'},
  'Plugins': {dev: ['plugin'], dir: 'plugin', module: 'Update'},
  'Post meta': {dir: 'meta', module: 'PostTypes'},
  Roles: {dir: 'role', module: 'PostTypes'},
  'Single-Page Apps': {dir: 'app', ejectLabel: 'apps (apps/)', module: 'Apps', unchecked: ['pull', 'push', 'diff']},
  Snippets: {dev: ['snippet'], dir: 'snippet', module: 'Snippets'},
  'Static pages': {dev: ['page'], dir: 'page', module: 'Pages'},
  Taxonomies: {dir: 'taxonomy', module: 'PostTypes'},
  'Templates and parts': {dev: ['template', 'part'], dir: 'theme/template', module: 'Pages'},
  'Theme CSS': {dev: ['css'], dir: 'theme/template', module: 'Pages', unchecked: ['diff']},
  'Theme Styles': {dir: 'theme/style', module: 'Themes'},
  Themes: {dir: 'theme', module: 'Update', unchecked: ['rollback']},
}

const HEADERS = ['Resource', 'Edition', 'pull', 'push', 'diff', 'promote', 'rollback', 'dev', 'Eject']
const COLUMNS = ['pull', 'push', 'diff'] as const

type Row = {cells: Record<string, string>; name: string}

function stripLinks(cell: string): string {
  // eslint-disable-next-line sonarjs/super-linear-regex -- negated classes, no overlap, input is one table cell
  return cell.replaceAll(/\[([^\]]*)\]\([^)]*\)/gu, '$1').trim()
}

function splitRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => stripLinks(cell))
}

function readMatrix(): Row[] {
  const lines = readFileSync(workflowDoc, 'utf8').split('\n')
  const start = lines.findIndex((line) => line.startsWith('| Resource | Edition |'))
  if (start === -1) throw new Error('The capability table is missing from workflow.md')
  const header = splitRow(lines[start] ?? '').map((h) => h.replaceAll('`', ''))
  if (header.join(',') !== HEADERS.join(',')) throw new Error(`Unexpected table header: ${header.join(',')}`)
  const rows: Row[] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break
    const cells = splitRow(line)
    rows.push({cells: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])), name: cells[0] ?? ''})
  }

  return rows
}

const hasFile = (dir: string, command: string): boolean => existsSync(join(commandsDir, dir, `${command}.ts`))
const commandFile = (cell: string): string | undefined =>
  cell.startsWith('`lps ') && cell.endsWith('`') ? cell.slice(5, -1).replaceAll(' ', '/') : undefined
const byName = (a: string, b: string): number => a.localeCompare(b)

// A cell is either ✓ (the file exists), a command name (that command's file exists), or a
// "no <command>" / empty note (no such file). Returns what disagrees with the code.
function checkFileColumn(row: Row, column: (typeof COLUMNS)[number], spec: Spec): string[] {
  if (spec.unchecked?.includes(column)) return []
  const cell = row.cells[column] ?? ''
  const named = commandFile(cell)
  const label = `${row.name} ${column}`
  if (cell === '✓') return hasFile(spec.dir, column) ? [] : [`${label} is ✓ but ${spec.dir}/${column}.ts does not exist`]
  if (named) return existsSync(join(commandsDir, `${named}.ts`)) ? [] : [`${label}: ${cell} does not exist`]

  return hasFile(spec.dir, column) ? [`${label} is "${cell}" but ${spec.dir}/${column}.ts exists`] : []
}

function checkRollback(row: Row, spec: Spec): string[] {
  const cell = row.cells.rollback ?? ''
  const named = commandFile(cell)
  if (!named) return [`${row.name} rollback must be a command, got "${cell}"`]
  if (!existsSync(join(commandsDir, `${named}.ts`))) return [`${row.name}: ${cell} does not exist`]
  if (!spec.unchecked?.includes('rollback') && named !== `${spec.dir}/rollback`) return [`${row.name}: ${cell} is not ${spec.dir}/rollback.ts`]

  return []
}

function checkRow(row: Row, spec: Spec, fullOnly: string[], ejectSource: string): string[] {
  const problems = COLUMNS.flatMap((column) => checkFileColumn(row, column, spec))
  problems.push(...checkRollback(row, spec))

  if (!existsSync(join(pluginRoot, 'src', spec.module))) problems.push(`${row.name}: plugin src/${spec.module} does not exist`)
  const edition = fullOnly.includes(spec.module) ? 'Full' : 'Light'
  if (row.cells.Edition !== edition) problems.push(`${row.name} Edition is "${row.cells.Edition}", the plugin makes ${spec.module} ${edition}`)

  const both = row.cells.pull === '✓' && row.cells.push === '✓'
  if (row.cells.promote !== (both ? '✓' : '')) problems.push(`${row.name} promote must be ${both ? '✓' : 'empty'}: it is a pull then a push`)

  return [...problems, ...checkDev(row, spec), ...checkEject(row, spec, ejectSource)]
}

function checkDev(row: Row, spec: Spec): string[] {
  const types = spec.dev ?? []
  const problems = types.filter((type) => !RESOURCE_TYPES.includes(type as never)).map((type) => `${row.name}: "${type}" is not a dev watch type`)
  const expected = types.length > 0 ? '✓' : ''
  if (row.cells.dev !== expected) problems.push(`${row.name} dev must be "${expected}" (lps dev watch types)`)

  return problems
}

function checkEject(row: Row, spec: Spec, ejectSource: string): string[] {
  const problems: string[] = []
  if (!['generated', 'native', 'refused'].includes(row.cells.Eject ?? '')) problems.push(`${row.name} Eject is "${row.cells.Eject}"`)
  const refusedByCode = spec.ejectLabel !== undefined && ejectSource.includes(spec.ejectLabel)
  if ((row.cells.Eject === 'refused') !== refusedByCode) problems.push(`${row.name} Eject is "${row.cells.Eject}" but eject.ts ${refusedByCode ? 'refuses' : 'does not refuse'} it`)

  return problems
}

describe('resource capability matrix (workflow.md)', () => {
  const rows = readMatrix()

  it('has one row per known resource', () => {
    expect(rows.map((r) => r.name).toSorted(byName)).toEqual(Object.keys(RESOURCES).toSorted(byName))
  })

  it('agrees with the commands, the plugin editions and eject', () => {
    const fullOnly = deriveFullOnlyFeatures(pluginRoot)
    const ejectSource = readFileSync(join(cliRoot, 'src/lib/eject.ts'), 'utf8')
    const problems = rows.flatMap((row) => {
      const spec = RESOURCES[row.name]

      return spec ? checkRow(row, spec, fullOnly, ejectSource) : []
    })
    expect(problems).toEqual([])
  })

  it('has a rollback.ts in every command directory that has a push.ts', () => {
    const dirs = Object.values(RESOURCES)
      .filter((spec) => !spec.unchecked?.includes('rollback') && hasFile(spec.dir, 'push'))
      .map((spec) => spec.dir)
    expect(dirs.filter((dir) => !hasFile(dir, 'rollback'))).toEqual([])
  })

  it('lists every dev watch type', () => {
    const covered = Object.values(RESOURCES).flatMap((spec) => spec.dev ?? [])
    expect(covered.toSorted(byName)).toEqual([...RESOURCE_TYPES].toSorted(byName))
  })
})
