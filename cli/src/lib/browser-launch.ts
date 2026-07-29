import {type Browser, chromium} from 'playwright-core'

const CHANNELS = ['chrome', 'msedge', 'chromium'] as const

/**
 * Launches a locally installed Chrome/Edge/Chromium via `playwright-core`, which ships no
 * bundled browser (unlike `playwright`, ~300MB of Chromium): it drives whatever's already on
 * the machine, tried in this order. Always headless: this flow has no click for a human to
 * make, so there's nothing a visible window would let anyone do differently.
 */
export async function launchLocalBrowser(): Promise<Browser> {
  let lastError: unknown

  for (const channel of CHANNELS) {
    try {
      return await chromium.launch({channel, headless: true})
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    'No local Chrome, Edge, or Chromium install found. Install one of these browsers to install Loopress Full automatically, or install it manually from wp-admin.',
    {cause: lastError},
  )
}
