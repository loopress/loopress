import {Flags, ux} from '@oclif/core'
import ttyTable from 'tty-table'

import {LoopressCommand} from '../../lib/base.js'
import {type ListedOption, OPTIONS_ENDPOINT} from '../../utils/option-format.js'
import {pluralize} from '../../utils/pluralize.js'

// Same green/yellow pairing drives both SOURCE? and PLUGIN, so a row's whole "where did this come
// from" story reads as one color at a glance instead of requiring the "?" to be spotted in text.
function confidenceColor(option: ListedOption): 'green' | 'yellow' | undefined {
  if (!option.guess) return undefined
  return option.confirmed ? 'green' : 'yellow'
}

function colorize(color: 'green' | 'yellow' | undefined, text: string): string {
  return color ? ux.colorize(color, text) : text
}

// SOURCE? is a best-effort guess, kept visually uncertain with a trailing "?" unless `confirmed`
// (the guessed plugin's own source was found to reference the name), which drops the "?".
function sourceCell(option: ListedOption): string {
  if (!option.guess) return ''
  return colorize(confidenceColor(option), option.confirmed ? option.guess : `${option.guess}?`)
}

function pluginCell(option: ListedOption): string {
  return option.pluginName ? colorize(confidenceColor(option), option.pluginName) : ''
}

function coreCell(option: ListedOption): string {
  return option.core ? ux.colorize('cyan', 'yes') : ''
}

// Spells out what the colors mean once, up front, rather than leaving green/yellow (and cyan when
// CORE is shown) to be decoded from the table alone.
function renderLegend(includeCore: boolean): string {
  const items = [`${ux.colorize('green', '■')} confirmed`, `${ux.colorize('yellow', '■')} guessed, unconfirmed (?)`]
  if (includeCore) items.push(`${ux.colorize('cyan', '■')} WordPress core`)
  return items.join(' '.repeat(3))
}

// AUTOLOAD/CORE deliberately get no `width` below, leaving them 'auto' (content-sized): tty-table
// has a real bug in its fixed-width path (confirmed against its own source, format.js's
// getColumnWidths) where `result = column.width; result = result + config.GUTTER` string-
// concatenates a width like "11" with the gutter number instead of adding them ("11" + 1 ===
// "111"), massively overshooting. 'auto' does the arithmetic correctly and is exactly what these
// two columns need anyway: their own header ("AUTOLOAD"/"CORE") is the longest thing they ever
// have to display, at 11 and 7 chars respectively (text + 2 padding + 1 gutter).
const AUTO_COLUMN_CHARS = {autoload: 11, core: 7}

// Relative weights, not literal percentages (normalized below): NAME varies most (plugin slugs
// and cache keys can run long) so it gets the largest share of whatever's left once AUTOLOAD/CORE
// take their fixed chars.
const COLUMN_WEIGHT = {name: 40, plugin: 24, source: 28}

// Each percentage column also costs 2 chars of padding + 1 gutter beyond its own percentage share
// (tty-table adds those on top, not out of it); NAME/SOURCE?/PLUGIN are always all three present.
const PERCENTAGE_COLUMN_OVERHEAD = 3 * 3

// Columns stay content-sized by default (tty-table only shrinks to fit, never grows), which left
// the table narrow with a lot of unused terminal width. Assigning NAME/SOURCE?/PLUGIN an explicit
// percentage of the terminal forces them to fill it instead. The percentage has to be computed
// against the actual available width, not a flat constant: a flat "88%" left enough room at a
// wide terminal but, combined with AUTOLOAD/CORE's own fixed chars and the padding/gutter overhead
// above, overran an ordinary ~100-column one, and tty-table's shrink-to-fit response shrank
// AUTOLOAD/CORE below their own header text, truncating "AUTOLOAD" to "AUTOL…" (found testing at
// exactly that width).
function fillPercent(width: number, includeCore: boolean): number {
  const reserved = AUTO_COLUMN_CHARS.autoload + (includeCore ? AUTO_COLUMN_CHARS.core : 0) + PERCENTAGE_COLUMN_OVERHEAD + 4 // +4: slim right margin
  return Math.max(50, ((width - reserved) / width) * 100)
}

function columnWidth(weight: number, width: number, includeCore: boolean): string {
  const total = COLUMN_WEIGHT.name + COLUMN_WEIGHT.source + COLUMN_WEIGHT.plugin
  return `${Math.round((weight / total) * fillPercent(width, includeCore))}%`
}

// tty-table sizes columns against process.stdout.columns when present (a real terminal, correctly
// left alone: a genuinely narrow window should wrap). Piped/redirected output and this process
// itself (no TTY) has neither that nor $COLUMNS, so the library falls back to a hardcoded 80 and
// squeezes every cell into broken multi-line wrapping regardless of any width option passed in,
// confirmed against its own source (getAvailableWidth() in format.js only reads config.width at
// all when one of the two is set). A generous $COLUMNS makes that fallback path wide instead.
const NON_TTY_FALLBACK_COLUMNS = 300

// Bordered table via tty-table (an oclif-recommended table library, see
// https://oclif.io/docs/user_experience). CORE is a fact (matched against WordPress's own
// install-time defaults), hidden entirely under --no-core rather than left as an all-blank
// column. See confidenceColor() above for SOURCE?/PLUGIN's shared sûr/pas sûr color coding.
function renderTable(rows: ListedOption[], {includeCore}: {includeCore: boolean}): string {
  const previousColumns = process.env.COLUMNS
  if (!process.stdout.columns) process.env.COLUMNS = String(NON_TTY_FALLBACK_COLUMNS)

  // Mirrors tty-table's own getAvailableWidth(): its column-width percentages are computed against
  // this same number, so fillPercent() above needs it too to reserve the right amount for AUTOLOAD/CORE.
  const width = (process.stdout.columns || Number(process.env.COLUMNS) || NON_TTY_FALLBACK_COLUMNS) - 2

  const header = [
    {align: 'left', headerAlign: 'left', value: 'NAME', width: columnWidth(COLUMN_WEIGHT.name, width, includeCore)},
    {align: 'left', headerAlign: 'left', value: 'AUTOLOAD'},
  ]
  if (includeCore) header.push({align: 'left', headerAlign: 'left', value: 'CORE'})
  header.push(
    {align: 'left', headerAlign: 'left', value: 'SOURCE?', width: columnWidth(COLUMN_WEIGHT.source, width, includeCore)},
    {align: 'left', headerAlign: 'left', value: 'PLUGIN', width: columnWidth(COLUMN_WEIGHT.plugin, width, includeCore)},
  )

  const body = rows.map((row) => {
    const cells = [row.name, row.autoload]
    if (includeCore) cells.push(coreCell(row))
    cells.push(sourceCell(row), pluginCell(row))
    return cells
  })

  try {
    // truncate (rather than the default wrap) so an oversized cell, like a WPForms cache key
    // seen live running ~140 chars, ellipsizes on one line instead of blowing up the row height.
    return ttyTable(header, body, {borderStyle: 'solid', compact: true, truncate: '…'}).render()
  } finally {
    if (previousColumns === undefined) delete process.env.COLUMNS
    else process.env.COLUMNS = previousColumns
  }
}

export default class List extends LoopressCommand {
  static description =
    'List WordPress option names currently on the site (names and autoload only, never values). ' +
    'CORE flags a WordPress-native default (certain); SOURCE? is a best-effort guessed plugin slug, found by name or by ' +
    'scanning active plugins\' own PHP source (uncertain unless confirmed, occasionally wrong or blank, never trust it over CORE); ' +
    'PLUGIN is that slug\'s own declared display name, a label only, no confidence of its own. ' +
    'Use this to find the name of the option you want, then `lps option add <name>` to track it.'

  static enableJsonFlag = true
  static examples = ['$ lps option list', '$ lps option list --no-core']

  static flags = {
    'no-core': Flags.boolean({
      description: 'Hide WordPress-native default options and the CORE column from the output (display only, does not affect --json)',
    }),
  }

  async run(): Promise<ListedOption[]> {
    const {flags} = await this.parse(List)

    // Every call scans active plugins' own PHP source for names the naming guess missed (not
    // opt-in, roughly 1-3s on a real site once vendor/tests/languages are pruned from the scan;
    // see OptionsService::listOptionNames() server-side), hence the spinner unconditionally.
    ux.action.start('Fetching and verifying options')
    let options: ListedOption[]
    try {
      options = await this.wp.get<ListedOption[]>(OPTIONS_ENDPOINT)
    } finally {
      ux.action.stop()
    }

    if (flags['no-core']) options = options.filter((option) => !option.core)

    if (options.length === 0) {
      this.log('No options found')
      return options
    }

    const includeCore = !flags['no-core']
    this.log(`Found ${pluralize(options.length, 'option')}:\n`)
    this.log(renderLegend(includeCore))
    this.log('')
    this.log(renderTable(options, {includeCore}))

    return options
  }
}
