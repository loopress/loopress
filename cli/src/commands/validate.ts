import {Command} from '@oclif/core'

import {validateLocal, type ValidateResult} from '../lib/validate-local.js'

export default class Validate extends Command {
  static description = 'Check local tracked files are well formed and push-ready, without contacting WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps validate']

  async run(): Promise<ValidateResult> {
    await this.parse(Validate)

    const result = await validateLocal(process.cwd())

    if (!this.jsonEnabled()) {
      for (const problem of result.problems) {
        this.log(`  ✗ ${problem.file}: ${problem.message}`)
      }

      this.log('')
      this.log(
        result.valid
          ? `${result.checked} file(s) checked, no problems found.`
          : `${result.checked} file(s) checked, ${result.problems.length} problem(s) found.`,
      )
    }

    // Non-zero exit for CI without throwing, so `--json` still prints the full report.
    if (!result.valid) process.exitCode = 1

    return result
  }
}
