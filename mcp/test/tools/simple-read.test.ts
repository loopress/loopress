import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerDoctorTools} from '../../src/tools/doctor.js'
import {registerStatusTools} from '../../src/tools/status.js'
import {registerValidateTools} from '../../src/tools/validate.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

describe('single read-only tools', () => {
  beforeEach(() => runLps.mockClear())

  it('project_status runs plain `status` without an env override', async () => {
    const {server, tools} = fakeServer()
    registerStatusTools(server)
    await tools.get('project_status')!({})
    expect(runLps).toHaveBeenCalledWith(['status'])
  })

  it('project_status runs `status --env <env>` with an override', async () => {
    const {server, tools} = fakeServer()
    registerStatusTools(server)
    await tools.get('project_status')!({env: 'staging'})
    expect(runLps).toHaveBeenCalledWith(['status', '--env', 'staging'])
  })

  it('project_doctor forwards --env through buildArgs', async () => {
    const {server, tools} = fakeServer()
    registerDoctorTools(server)
    await tools.get('project_doctor')!({env: 'prod'})
    expect(runLps).toHaveBeenCalledWith(['doctor', '--env', 'prod'])

    await tools.get('project_doctor')!({})
    expect(runLps).toHaveBeenLastCalledWith(['doctor'])
  })

  it('validate_local runs plain `validate`, contacting no environment', async () => {
    const {server, tools} = fakeServer()
    registerValidateTools(server)
    await tools.get('validate_local')!({})
    expect(runLps).toHaveBeenCalledWith(['validate'])
  })
})
