import {existsSync, unlinkSync} from 'node:fs'
import {join} from 'node:path'

import {readJsonFile, writeJsonFileAtomic} from './json-file.js'

export interface ConsoleAuth {
  email?: string
  savedAt: string
  token: string
}

export class AuthManager {
  constructor(private dataDir?: string) {}

  clearAuth(): void {
    const filePath = this.getAuthFilePath()
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  getAuth(): ConsoleAuth | null {
    return readJsonFile<ConsoleAuth>(this.getAuthFilePath())
  }

  getAuthFilePath(): string {
    return join(this.requireDataDir(), 'auth.json')
  }

  setAuth(auth: ConsoleAuth): void {
    writeJsonFileAtomic(this.getAuthFilePath(), auth)
  }

  // Real CLI runs get this from the `init` hook (src/hooks/init.ts) before any command runs.
  // Throwing when it's unset (rather than falling back to a hardcoded path) surfaces tests that
  // forgot to configure the manager instead of silently touching some default location.
  setDataDir(dataDir: string): void {
    this.dataDir = dataDir
  }

  private requireDataDir(): string {
    if (!this.dataDir) throw new Error('AuthManager used before setDataDir() was called')
    return this.dataDir
  }
}

export const authManager = new AuthManager()
