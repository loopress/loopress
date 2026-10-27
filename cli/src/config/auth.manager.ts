import {existsSync, unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'

import {readJsonFile, writeJsonFileAtomic} from './json-file.js'

const CONSOLE_AUTH = z.object({email: z.string().optional(), savedAt: z.string(), token: z.string()})

export type ConsoleAuth = z.infer<typeof CONSOLE_AUTH>

export class AuthManager {
  private dataDir: string | undefined

  constructor(dataDir?: string) {
    this.dataDir = dataDir
  }

  clearAuth(): void {
    const filePath = this.getAuthFilePath()
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  getAuth(): ConsoleAuth | null {
    // A hand-edited or truncated auth.json reads as logged out, not as a token-less session.
    const result = CONSOLE_AUTH.safeParse(readJsonFile(this.getAuthFilePath()))
    return result.success ? result.data : null
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
