import {type EnvironmentConfig} from '../types/config.js'
import {WpClient} from './wp-client.js'

const APPLICATION_PASSWORDS_PATH = 'wp/v2/users/me/application-passwords'

export const APP_PASSWORD_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

type ApplicationPasswordEntry = {
  password?: string
  uuid: string
}

export function isAppPasswordStale(addedAt: string): boolean {
  return Date.now() - new Date(addedAt).getTime() > APP_PASSWORD_MAX_AGE_MS
}

// Create the new credential, confirm it actually authenticates on its own, only then revoke
// the old one. Reversing this order risks locking the user out if the new one is somehow bad.
export async function rotateAppPassword(env: EnvironmentConfig & {token: string}): Promise<EnvironmentConfig> {
  const [user] = env.token.split(':', 1)
  const oldClient = new WpClient(env.url, env.token)

  const old = await oldClient.get<ApplicationPasswordEntry>(`${APPLICATION_PASSWORDS_PATH}/introspect`)
  const created = await oldClient.post<ApplicationPasswordEntry>(APPLICATION_PASSWORDS_PATH, {name: 'Loopress'})

  if (!created.password) {
    throw new Error(`WordPress did not return a password when creating the new application password on ${env.url}.`)
  }

  const newToken = `${user}:${created.password}`
  const newClient = new WpClient(env.url, newToken)

  try {
    await newClient.get(`${APPLICATION_PASSWORDS_PATH}/introspect`)
  } catch (error) {
    // The new credential exists on WordPress but was never confirmed to work: clean it up with
    // the still-valid old credentials instead of leaving an orphan behind. maybeAutoRotate
    // retries on every subsequent run, so a persistent failure here would otherwise pile up
    // one abandoned 'Loopress' entry per attempt. Best-effort: a failure here shouldn't hide
    // the original, more informative error.
    await oldClient.delete(`${APPLICATION_PASSWORDS_PATH}/${created.uuid}`).catch(() => {})
    throw error
  }

  await newClient.delete(`${APPLICATION_PASSWORDS_PATH}/${old.uuid}`)

  return {...env, addedAt: new Date().toISOString(), token: newToken}
}
