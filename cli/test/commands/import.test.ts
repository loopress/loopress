import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('import', () => {
  const url = process.env.WP_URL
  const user = process.env.WP_USERNAME
  const password = process.env.WP_APP_PASSWORD

  console.log('Running import command tests with the following environment variables:')
  console.log(user)
  console.log(password)

  it('runs import command with dry run', async () => {
    const {error, stdout} = await runCommand(
      `import test.json --user ${user} --password "${password}" --dryRun --url ${url}`,
    )
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
  })

  it('runs import command with force overwrite', async () => {
    const {error, stdout} = await runCommand(
      `import test.json --user ${user} --password "${password}" --force --url ${url}`,
    )
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
  })
})
