import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('list', () => {
  const url = process.env.WP_URL
  const user = process.env.WP_USERNAME
  const password = process.env.WP_APP_PASSWORD

  it('runs list command with json format', async () => {
    const {error, stdout} = await runCommand(`list --user ${user} --password "${password}" --json --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
  })

  it('runs list command with default url', async () => {
    const {error, stdout} = await runCommand(`list --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain('Found')
  })

  it('runs list command with user and password', async () => {
    const {error, stdout} = await runCommand(`list --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain(user)
  })
})
