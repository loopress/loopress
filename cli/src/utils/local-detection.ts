import {promises as dns} from 'node:dns'

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false

  const [a, b] = parts
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export async function isLocalUrl(rawUrl: string): Promise<boolean> {
  try {
    const {hostname} = new URL(rawUrl)
    if (hostname === 'localhost') return true
    const {address} = await dns.lookup(hostname)
    return isPrivateIp(address)
  } catch {
    return false
  }
}
