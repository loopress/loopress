import got from 'got'

import {authManager} from '../config/auth.manager.js'

const API_URL = process.env.LPS_API_URL ?? 'https://api.loopress.dev'

function getToken(): string | null {
  return process.env.LPS_TOKEN ?? authManager.getAuth()?.token ?? null
}

export async function recordDeployment(data: {
  url: string
  snippetCount?: number
  status: 'success' | 'failure'
}): Promise<void> {
  const token = getToken()
  if (!token) return

  try {
    await got.post(`${API_URL}/deployments`, {
      headers: {Authorization: `Bearer ${token}`},
      json: data,
    })
  } catch {
    // non-blocking: recording must never interrupt the push flow
  }
}
