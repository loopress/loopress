import {existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

export interface ConsoleAuth {
  email?: string
  savedAt: string
  token: string
}

export class AuthManager {
  private static instance: AuthManager

  constructor(private readonly homeDir: string = homedir()) {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager()
    }

    return AuthManager.instance
  }

  getAuthFilePath(): string {
    return join(this.homeDir, '.wdx', 'auth.json')
  }

  getAuth(): ConsoleAuth | null {
    const filePath = this.getAuthFilePath()
    if (!existsSync(filePath)) return null

    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as ConsoleAuth
    } catch {
      return null
    }
  }

  setAuth(auth: ConsoleAuth): void {
    const dir = join(this.homeDir, '.wdx')
    if (!existsSync(dir)) mkdirSync(dir, {recursive: true})

    const filePath = this.getAuthFilePath()
    const tmpPath = `${filePath}.tmp`
    writeFileSync(tmpPath, JSON.stringify(auth, null, 2))
    renameSync(tmpPath, filePath)
  }

  clearAuth(): void {
    const filePath = this.getAuthFilePath()
    if (existsSync(filePath)) unlinkSync(filePath)
  }
}

export const authManager = AuthManager.getInstance()
