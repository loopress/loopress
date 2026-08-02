import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {AuthManager} from '../../src/config/auth.manager.js'

describe('AuthManager', () => {
  let tmpDir: string
  let manager: AuthManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lps-auth-manager-test-'))
    manager = new AuthManager(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, {force: true, recursive: true})
  })

  it('throws when used before setDataDir() has been called', () => {
    const unconfigured = new AuthManager()
    expect(() => unconfigured.getAuthFilePath()).toThrow('AuthManager used before setDataDir() was called')
  })

  it('uses the data dir passed to setDataDir() after construction', () => {
    const manager2 = new AuthManager()
    manager2.setDataDir(tmpDir)
    expect(manager2.getAuthFilePath()).toBe(join(tmpDir, 'auth.json'))
  })

  it('getAuthFilePath() points at auth.json inside the data dir', () => {
    expect(manager.getAuthFilePath()).toBe(join(tmpDir, 'auth.json'))
  })

  it('getAuth() returns null when no auth has been saved yet', () => {
    expect(manager.getAuth()).toBeNull()
  })

  it('setAuth() then getAuth() round-trips the saved auth', () => {
    manager.setAuth({email: 'a@b.com', savedAt: '2024-01-01', token: 'jwt-token'})

    expect(manager.getAuth()).toEqual({email: 'a@b.com', savedAt: '2024-01-01', token: 'jwt-token'})
  })

  it('setAuth() overwrites a previously saved auth', () => {
    manager.setAuth({savedAt: '2024-01-01', token: 'old-token'})
    manager.setAuth({savedAt: '2024-02-01', token: 'new-token'})

    expect(manager.getAuth()).toEqual({savedAt: '2024-02-01', token: 'new-token'})
  })

  it('clearAuth() removes a saved auth', () => {
    manager.setAuth({savedAt: '2024-01-01', token: 'jwt-token'})

    manager.clearAuth()

    expect(manager.getAuth()).toBeNull()
  })

  it('clearAuth() is a no-op when there is nothing to clear', () => {
    expect(() => manager.clearAuth()).not.toThrow()
    expect(manager.getAuth()).toBeNull()
  })
})
