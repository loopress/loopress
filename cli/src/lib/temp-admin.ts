import {randomBytes} from 'node:crypto'

import {isNotFoundError, type WpClient} from './wp-client.js'

export type TempAdmin = {
  id: number
  password: string
  username: string
}

type WpUser = {
  id: number
}

type WpUserEdit = WpUser & {email: string; username: string}

const TEMP_ADMIN_PREFIX = 'lps-temp-'
const TEMP_ADMIN_EMAIL_DOMAIN = '@lps-temp.invalid'

// Only role that carries `install_plugins`/`activate_plugins`; there's nothing narrower to grant.
const TEMP_ADMIN_ROLE = 'administrator'

/**
 * Creates a temporary WordPress administrator, the only way to obtain `install_plugins` when
 * all the CLI has is an application password. `.invalid` is the RFC 2606 reserved TLD for
 * addresses guaranteed not to be real, appropriate for an account that has no real mailbox.
 */
export async function createTempAdmin(wp: WpClient): Promise<TempAdmin> {
  const username = `${TEMP_ADMIN_PREFIX}${Date.now().toString(36)}`
  const password = randomBytes(24).toString('base64url')

  const user = await wp.post<WpUser>('wp/v2/users', {
    email: `${username}${TEMP_ADMIN_EMAIL_DOMAIN}`,
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
export async function deleteTempAdmin(wp: WpClient, admin: Pick<TempAdmin, 'id' | 'username'>): Promise<void> {
  const me = await wp.get<WpUser>('wp/v2/users/me')

  try {
    await wp.delete(`wp/v2/users/${admin.id}?reassign=${me.id}&force=true`)
  } catch (error) {
    throw new Error(
      `Failed to remove the temporary admin account "${admin.username}" (id ${admin.id}) from the site. Remove it manually from wp-admin.`,
      {cause: error},
    )
  }

  const isStillExists = await wp
    .get<WpUser>(`wp/v2/users/${admin.id}`)
    .then(() => true)
    .catch((error: unknown) => {
      if (isNotFoundError(error)) return false
      throw error
    })

  if (isStillExists) {
    throw new Error(
      `Temporary admin account "${admin.username}" (id ${admin.id}) still exists after deletion. Remove it manually from wp-admin.`,
    )
  }
}

/**
 * Lists temporary admins a previous bootstrap left behind: a process killed with SIGKILL, a
 * machine that lost power, or a network drop during deleteTempAdmin() skips every cleanup path.
 * Matching both the username prefix and the `.invalid` email keeps a real user who happens to
 * be named `lps-temp-...` out of it. `context=edit` exposes `username` and `email` and lists
 * every user, not only those with published posts.
 */
export async function findTempAdmins(wp: WpClient): Promise<Array<Pick<TempAdmin, 'id' | 'username'>>> {
  const users = await wp.getAll<WpUserEdit>(`wp/v2/users?context=edit&search=${TEMP_ADMIN_PREFIX}`)
  return users
    .filter((user) => user.username.startsWith(TEMP_ADMIN_PREFIX) && user.email.endsWith(TEMP_ADMIN_EMAIL_DOMAIN))
    .map(({id, username}) => ({id, username}))
}

// Deletes every leftover temp admin, returning the usernames removed. Throws on the first one
// that can't be removed, naming it (deleteTempAdmin's own error).
export async function sweepTempAdmins(wp: WpClient): Promise<string[]> {
  const leftovers = await findTempAdmins(wp)
  for (const admin of leftovers) {
    // Sequential on purpose: the first failure stops the sweep, naming its account.
    await deleteTempAdmin(wp, admin)
  }

  return leftovers.map((admin) => admin.username)
}
