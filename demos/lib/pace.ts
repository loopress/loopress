import type {Locator, Page} from '@playwright/test'

// Automated input is instant; a screencast needs a human cadence. These are the only timing
// knobs the demo scripts should use, so pacing stays consistent from one take to the next.
export const BEAT = 650 // a pause the eye can follow
export const HOLD = 1400 // "let the viewer read this" pause

export const beat = (page: Page, n = 1): Promise<void> => page.waitForTimeout(BEAT * n)
export const hold = (page: Page, n = 1): Promise<void> => page.waitForTimeout(HOLD * n)

// Type at a readable ~16 chars/sec instead of Playwright's instant fill.
export async function typeHuman(target: Locator, text: string, cps = 16): Promise<void> {
  await target.pressSequentially(text, {delay: 1000 / cps})
}

export async function smoothScrollIntoView(target: Locator): Promise<void> {
  await target.evaluate((el) => {
    el.scrollIntoView({behavior: 'smooth', block: 'center'})
  })
}
