import type {Locator, Page} from '@playwright/test'

// Playwright's video records the DOM, not the OS pointer, so without this a recorded click
// looks like the page acts on its own. Inject a CSS dot that follows the real mouse events
// `page.mouse.*` already dispatches, so the screencast shows intent.
export async function installCursor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const dot = document.createElement('div')
    dot.setAttribute('data-demo-cursor', '')
    dot.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:22px',
      'height:22px',
      'margin:-11px 0 0 -11px',
      'border-radius:50%',
      'background:rgba(17,17,17,.22)',
      'border:2px solid rgba(17,17,17,.7)',
      'box-shadow:0 0 0 3px rgba(255,255,255,.55)',
      'pointer-events:none',
      'z-index:2147483647',
      'opacity:0',
      'transition:transform 90ms linear,opacity 140ms ease',
    ].join(';')

    let x = 0
    let y = 0
    let down = false
    const paint = () => {
      dot.style.transform = `translate(${x}px, ${y}px) scale(${down ? 0.82 : 1})`
    }

    const attach = () => {
      document.body.append(dot)
      addEventListener('mousemove', (e) => {
        x = e.clientX
        y = e.clientY
        dot.style.opacity = '1'
        paint()
      }, {passive: true})
      addEventListener('mousedown', () => {
        down = true
        paint()
      }, {passive: true})
      addEventListener('mouseup', () => {
        down = false
        paint()
      }, {passive: true})
    }

    if (document.body) attach()
    else addEventListener('DOMContentLoaded', attach)
  })
}

// Glide the pointer to the centre of `target` instead of teleporting (`steps` interpolates
// the move, which is what makes the recorded cursor travel).
export async function glideTo(page: Page, target: Locator, steps = 24): Promise<void> {
  const box = await target.boundingBox()
  if (!box) throw new Error('glideTo: target has no bounding box (off-screen or hidden?)')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps})
}

export async function glideClick(page: Page, target: Locator): Promise<void> {
  await glideTo(page, target)
  await page.waitForTimeout(120)
  await target.click()
}
