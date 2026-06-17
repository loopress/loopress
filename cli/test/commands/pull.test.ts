import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pull', () => {
  const url = process.env.WP_URL
  const user = process.env.WP_USERNAME
  const password = process.env.WP_APP_PASSWORD

  it('runs pull command with dry run', async () => {
    const {error, stdout} = await runCommand(`pull --user ${user} --password "${password}" --dryRun --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
  })

  it('runs pull command with default path', async () => {
    const {error, stdout} = await runCommand(`pull --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain('./snippets')
  })

  it('runs pull command with default url', async () => {
    const {error, stdout} = await runCommand(`pull --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain(url)
  })

  it('runs pull command with user and password', async () => {
    const {error, stdout} = await runCommand(`pull --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain(user)
  })
})
