// Browser side of the screencast.
//
// runAuthorize() drives the WordPress Application-Password authorization: logs into
// wp-admin, lands on the "Authorize application" page, moves a fake cursor to the app-name
// field then the approve button, approves it, holds the success message, and lands back on
// the wp-admin dashboard, all before the CLI installs the plugin.
//
// pluginPage() is called afterwards, once the CLI has installed Loopress Full: it loads the
// dashboard (the new Loopress menu is already there) and clicks that menu with the cursor to
// reach the plugin's admin page. It reuses the wp-admin session runAuthorize() saved.
//
// Each call records its own webm into `videoDir`.
import {existsSync} from 'node:fs'
import {dirname, join, normalize} from 'node:path'
import {argv, env} from 'node:process'
import {fileURLToPath} from 'node:url'

import {chromium} from '@playwright/test'
import type {Browser, BrowserContext, Page} from '@playwright/test'

const WP_URL = (env.WP_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const WP_HOST = WP_URL.split('//', 2)[1] ?? WP_URL
const WP_USER = env.WP_ADMIN_USER ?? 'admin'
const WP_PASS = env.WP_ADMIN_PASS ?? 'admin'

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']

const sleep = (seconds: number): Promise<void> => new Promise((r) => setTimeout(r, seconds * 1000))

// A fake pointer that glides toward the element we're about to act on. Playwright's real
// mouse leaves no visible cursor in a headless recording, so we draw our own. On first use
// it pops in right next to the target (no long travel from the centre of the page).
const CURSOR_MOVE_JS = String.raw`
(sel) => {
  const el = document.querySelector(sel);
  if (!el) return;
  el.scrollIntoView({block: 'center', inline: 'center'});
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height * 0.55;
  let c = document.getElementById('__lps_cur');
  if (!c) {
    c = document.createElement('div');
    c.id = '__lps_cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M4 2l5.5 15.5 2.3-6.2 6.2-2.3L4 2z" fill="#ffffff" stroke="#1e1e2e" '
      + 'stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {
      position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
      transition: 'none', filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.45))', willChange: 'left, top',
      left: (x - 34) + 'px', top: (y - 20) + 'px',
    });
    document.body.appendChild(c);
    c.getBoundingClientRect();  // reflow so the move below animates
    c.style.transition = 'left .2s cubic-bezier(.35,0,.25,1), top .2s cubic-bezier(.35,0,.25,1)';
  }
  c.style.left = x + 'px';
  c.style.top = y + 'px';
}
`

const CURSOR_CLICK_JS = String.raw`
() => {
  const c = document.getElementById('__lps_cur');
  if (!c) return;
  const x = parseFloat(c.style.left) || 0, y = parseFloat(c.style.top) || 0;
  const rip = document.createElement('div');
  Object.assign(rip.style, {
    position: 'fixed', left: (x - 7) + 'px', top: (y - 7) + 'px', width: '14px', height: '14px',
    borderRadius: '50%', border: '2px solid #89b4fa', zIndex: '2147483646', pointerEvents: 'none',
    transform: 'scale(1)', opacity: '0.9', transition: 'transform .3s ease-out, opacity .3s ease-out',
  });
  document.body.appendChild(rip);
  requestAnimationFrame(() => { rip.style.transform = 'scale(3.2)'; rip.style.opacity = '0'; });
  setTimeout(() => rip.remove(), 360);
  c.animate([{transform: 'scale(1)'}, {transform: 'scale(.82)'}, {transform: 'scale(1)'}], {duration: 170});
}
`

type PointOpts = {settle?: number; click?: boolean}

// Show / glide the fake cursor to `selector`; optionally play a click ripple there.
async function pointAt(page: Page, selector: string, {settle = 0.4, click = false}: PointOpts = {}): Promise<void> {
  try {
    await page.evaluate(CURSOR_MOVE_JS, selector)
    await sleep(0.24) // short glide
    if (click) {
      await page.evaluate(CURSOR_CLICK_JS)
      await sleep(0.16)
    }
    await sleep(settle)
  } catch {
    // best effort: a missing element must not abort the take
  }
}

async function launch(): Promise<Browser> {
  // System Chrome/Edge first (matches what the CLI's own installer uses); bundled Chromium
  // as the fallback so the folder works without Chrome installed.
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({channel, headless: true, args: LAUNCH_ARGS})
    } catch {
      // try the next channel
    }
  }
  return chromium.launch({headless: true, args: LAUNCH_ARGS})
}

const stateFile = (videoDir: string): string => join(dirname(normalize(videoDir)), 'wp-state.json')

async function context(browser: Browser, videoDir: string, storageState?: string): Promise<BrowserContext> {
  const options: Parameters<Browser['newContext']>[0] = {
    viewport: {width: 1280, height: 800},
    deviceScaleFactor: 1,
    recordVideo: {dir: videoDir, size: {width: 1280, height: 800}},
  }
  if (storageState && existsSync(storageState)) options.storageState = storageState
  return browser.newContext(options)
}

async function login(page: Page): Promise<void> {
  if (!page.url().includes('wp-login.php')) return
  await page.waitForSelector('#user_login', {timeout: 15_000})
  await page.fill('#user_login', WP_USER)
  await page.fill('#user_pass', WP_PASS)
  await sleep(1.0)
  await page.click('#wp-submit')
  await page.waitForLoadState('domcontentloaded')
}

export async function runAuthorize(authUrl: string, videoDir: string): Promise<string> {
  const browser = await launch()
  const ctx = await context(browser, videoDir)
  const page = await ctx.newPage()

  // api.loopress.dev relay -> <meta refresh> -> wp-admin/authorize-application.php
  await page.goto(authUrl, {waitUntil: 'domcontentloaded'})
  await page.waitForURL(`**${WP_HOST}/**`, {timeout: 20_000})
  await login(page)

  // The "Authorize application" consent screen: cursor to the app name, then the button.
  await page.waitForSelector('#approve', {timeout: 20_000})
  await page.waitForLoadState('networkidle')
  await sleep(0.4)
  await pointAt(page, '#app_name', {settle: 0.3})
  await pointAt(page, '#approve', {settle: 0.2, click: true})
  await page.click('#approve')

  // WordPress -> api.loopress.dev/auth/wp-callback -> auto-POST to the CLI's 127.0.0.1
  // callback server -> "Authorization successful!" page.
  try {
    await page.waitForLoadState('networkidle', {timeout: 20_000})
  } catch {
    // the callback hop can settle without a networkidle event
  }
  await sleep(2.0) // hold the success message

  // Back on the wp-admin dashboard, before the CLI installs the plugin. The CLI is parked on
  // its "Install it now?" prompt while this runs, so keep it short: domcontentloaded is
  // enough to show the dashboard, then hand focus back fast.
  await page.goto(`${WP_URL}/wp-admin/`, {waitUntil: 'domcontentloaded'})
  await sleep(0.25)

  // Keep the wp-admin session so pluginPage() doesn't have to log in again.
  try {
    await ctx.storageState({path: stateFile(videoDir)})
  } catch {
    // a missing session file just means pluginPage() logs in itself
  }

  const video = page.video()
  await ctx.close()
  await browser.close()
  return video ? video.path() : ''
}

const MENU_LINK = '#toplevel_page_loopress > a'

export async function pluginPage(videoDir: string): Promise<string> {
  const browser = await launch()
  const ctx = await context(browser, videoDir, stateFile(videoDir))
  const page = await ctx.newPage()

  // Fresh load of the dashboard, so the new "Loopress" menu is already in the sidebar (the
  // CLI's install has finished by now).
  await page.goto(`${WP_URL}/wp-admin/`, {waitUntil: 'domcontentloaded'})
  await login(page) // fallback only
  try {
    await page.waitForSelector(MENU_LINK, {timeout: 15_000})
  } catch {
    // the menu should be there; carry on and let the click retry below
  }
  await sleep(0.6)

  // Navigate to the plugin's page with the mouse: cursor to the Loopress menu, click.
  await pointAt(page, MENU_LINK, {settle: 0.2, click: true})
  try {
    await page.click(MENU_LINK)
    await page.waitForURL('**page=loopress**', {timeout: 15_000})
  } catch {
    await page.goto(`${WP_URL}/wp-admin/admin.php?page=loopress`, {waitUntil: 'domcontentloaded'})
  }
  try {
    await page.waitForLoadState('networkidle', {timeout: 15_000})
  } catch {
    // the plugin page can settle without a networkidle event
  }
  await sleep(0.5)
  await pointAt(page, '#wpbody-content h1', {settle: 0.7}) // the "Loopress Full" card
  await sleep(0.5)

  const video = page.video()
  await ctx.close()
  await browser.close()
  return video ? video.path() : ''
}

// Standalone entry, for iterating on the browser bits without a full record run:
//   node browser.ts authorize <auth-url> <video-dir>
//   node browser.ts plugin <video-dir>
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const [mode, ...rest] = argv.slice(2)
  const task = mode === 'plugin' ? pluginPage(rest[0]) : runAuthorize(rest[0], rest[1])
  task.then((path) => console.log(path)).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
