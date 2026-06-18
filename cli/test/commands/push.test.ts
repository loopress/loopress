import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('push', () => {
  const url = process.env.WP_URL
  const user = process.env.WP_USERNAME
  const password = process.env.WP_APP_PASSWORD

  it('runs push command with dry run', async () => {
    const {error, stdout} = await runCommand(
      `push ./test/__fixtures__ --user ${user} --password "${password}" --dryRun --url ${url}`,
    )
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain('Pushing')
  })

  it('runs push command with default path', async () => {
    const {error, stdout} = await runCommand(`push --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain('./snippets')
  })

  it('runs push command with user and password', async () => {
    const {error, stdout} = await runCommand(`push --user ${user} --password "${password}" --url ${url}`)
    expect(error).to.be.undefined
    expect(stdout).to.be.a('string')
    expect(stdout).to.not.be.empty
    expect(stdout).to.contain(user)
  })

  // it('runs push command without php files', async () => {
  //   const {error, stdout} = await runCommand(`push ./test-empty-snippets --user ${user} --password "${password}" --url ${url}`);
  //   console.log("error =>", error);
  //   expect(error).to.be.undefined;
  //   expect(stdout).to.be.a('string');
  //   expect(stdout).to.not.be.empty;
  //   expect(stdout).to.contain('Found');
  // });
})
