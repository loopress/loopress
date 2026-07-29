import {randomBytes} from 'node:crypto'

import {isNotFoundError, WpClient} from './wp-client.js'

export interface TempAdmin {
  id: number
  password: string
  username: string
}

interface WpUser {
  id: number
}

// Only role that carries `install_plugins`/`activate_plugins`; there's nothing narrower to grant.
const TEMP_ADMIN_ROLE = 'administrator'

/**
 * Creates a temporary WordPress administrator, the only way to obtain `install_plugins` when
 * all the CLI has is an application password. `.invalid` is the RFC 2606 reserved TLD for
 * addresses guaranteed not to be real, appropriate for an account that has no real mailbox.
 */
export async function createTempAdmin(wp: WpClient): Promise<TempAdmin> {
  const username = `lps-temp-${Date.now().toString(36)}`
  const password = randomBytes(24).toString('base64url')

  const user = await wp.post<WpUser>('wp/v2/users', {
    email: `${username}@lps-temp.invalid`,
    password,
    roles: [TEMP_ADMIN_ROLE],
    username,
  })

  return {id: user.id, password, username}
}

/**
 * Deletes the temporary admin, reassigning any content it might own to the real user behind
 * the app password. Failure here throws rather than warns, naming the leftover account: a
 * cleanup that silently fails would leave a live administrator with a random password on the
 * target site, discoverable only by someone reading logs closely.
 */
export async function deleteTempAdmin(wp: WpClient, admin: TempAdmin): Promise<void> {
  const me = await wp.get<WpUser>('wp/v2/users/me')

  try {
    await wp.delete(`wp/v2/users/${admin.id}?reassign=${me.id}&force=true`)
  } catch (error) {
    throw new Error(
      `Failed to remove the temporary admin account "${admin.username}" (id ${admin.id}) from the site. Remove it manually from wp-admin.`,
      {cause: error},
    )
  }

  const stillExists = await wp
    .get<WpUser>(`wp/v2/users/${admin.id}`)
    .then(() => true)
    .catch((error: unknown) => {
      if (isNotFoundError(error)) return false
      throw error
    })

  if (stillExists) {
    throw new Error(
      `Temporary admin account "${admin.username}" (id ${admin.id}) still exists after deletion. Remove it manually from wp-admin.`,
    )
  }
}
