import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('export', () => {
  const url = process.env.WP_URL
  const user = process.env.WP_USERNAME
  const password = process.env.WP_APP_PASSWORD

  it('runs export command with json format', async () => {
    const {error, stdout} = await runCommand(
      `export snippets.json --user ${user} --password "${password}" --url ${url}`,
    )

    console.log('Export command output:', error)

    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
  })
})
