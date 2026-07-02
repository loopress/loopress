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
  constructor(private readonly homeDir: string = homedir()) {}

  clearAuth(): void {
    const filePath = this.getAuthFilePath()
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  getAuth(): ConsoleAuth | null {
    return readJsonFile<ConsoleAuth>(this.getAuthFilePath())
  }

  getAuthFilePath(): string {
    return join(this.homeDir, '.loopress', 'auth.json')
  }

  setAuth(auth: ConsoleAuth): void {
    writeJsonFileAtomic(this.getAuthFilePath(), auth)
  }
}

export const authManager = new AuthManager()
