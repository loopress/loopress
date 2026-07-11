import {existsSync, unlinkSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {readJsonFile, writeJsonFileAtomic} from './json-file.js'

export interface ConsoleAuth {
  email?: string
  savedAt: string
  token: string
}

export class AuthManager {
  constructor(private dataDir: string = join(homedir(), '.loopress')) {}

  clearAuth(): void {
    const filePath = this.getAuthFilePath()
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  getAuth(): ConsoleAuth | null {
    return readJsonFile<ConsoleAuth>(this.getAuthFilePath())
  }

  getAuthFilePath(): string {
    return join(this.dataDir, 'auth.json')
  }

  setAuth(auth: ConsoleAuth): void {
    writeJsonFileAtomic(this.getAuthFilePath(), auth)
  }

  // Repointed by the `init` hook to oclif's native dataDir once the real CLI Config is
  // available. The constructor default only serves contexts that bypass the oclif lifecycle
  // (e.g. commands instantiated directly in unit tests).
  setDataDir(dataDir: string): void {
    this.dataDir = dataDir
  }
}

export const authManager = new AuthManager()
