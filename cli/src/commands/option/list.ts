import {LoopressCommand} from '../../lib/base.js'
import {type ListedOption, OPTIONS_ENDPOINT} from '../../utils/option-format.js'
import {pluralize} from '../../utils/pluralize.js'

// A handful of plugins write filesystem paths straight into an option name (seen live: a
// ~140-char WPForms cache key), which would otherwise stretch the whole NAME column to match
// that one outlier. Capped and ellipsized rather than left unbounded.
const MAX_NAME_WIDTH = 60

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

// Four-column, right-padded text table. No table library: this is a few lines of padEnd, not
// worth a dependency. CORE is a fact (matched against WordPress's own install-time defaults);
// SOURCE? is a best-effort guess (an active plugin whose slug prefixes the name) and stays
// visually marked as uncertain (the "?", a trailing "?" per row) rather than presented like CORE.
function renderTable(rows: ListedOption[]): string {
  const displayRows = rows.map((row) => ({
    autoload: row.autoload,
    core: row.core ? 'yes' : '',
    guess: row.guess ? `${row.guess}?` : '',
    name: truncate(row.name, MAX_NAME_WIDTH),
  }))
  const nameWidth = Math.max('NAME'.length, ...displayRows.map((row) => row.name.length))
  const autoloadWidth = Math.max('AUTOLOAD'.length, ...displayRows.map((row) => row.autoload.length))
  const coreWidth = 'CORE'.length
  const guessWidth = Math.max('SOURCE?'.length, ...displayRows.map((row) => row.guess.length))
  const line = (name: string, autoload: string, core: string, guess: string): string =>
    `  ${name.padEnd(nameWidth)}  ${autoload.padEnd(autoloadWidth)}  ${core.padEnd(coreWidth)}  ${guess.padEnd(guessWidth)}`

  return [
    line('NAME', 'AUTOLOAD', 'CORE', 'SOURCE?'),
    line('-'.repeat(nameWidth), '-'.repeat(autoloadWidth), '-'.repeat(coreWidth), '-'.repeat(guessWidth)),
    ...displayRows.map((row) => line(row.name, row.autoload, row.core, row.guess)),
  ].join('\n')
}

export default class List extends LoopressCommand {
  static description =
    'List WordPress option names currently on the site (names and autoload only, never values). ' +
    'CORE flags a WordPress-native default (certain); SOURCE? is a best-effort guessed plugin slug ' +
    '(uncertain, often wrong or blank, never trust it over CORE). ' +
    'Use this to find the name of the option you want, then `lps option add <name>` to track it.'

  static enableJsonFlag = true
  static examples = ['$ lps option list']

  async run(): Promise<ListedOption[]> {
    const options = await this.wp.get<ListedOption[]>(OPTIONS_ENDPOINT)

    if (options.length === 0) {
      this.log('No options found')
      return options
    }

    this.log(`Found ${pluralize(options.length, 'option')}:\n`)
    this.log(renderTable(options))

    return options
  }
}
