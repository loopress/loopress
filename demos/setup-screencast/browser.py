"""Browser side of the screencast.

`run()` drives the WordPress Application-Password authorization: logs into wp-admin, lands
on the "Authorize application" page, moves a fake cursor to the app-name field then the
approve button, approves it, and holds the success message.

`plugin_page()` is called afterwards, once the CLI has installed Loopress Full: it lands
back on the wp-admin dashboard, then opens the plugin's admin page (`admin.php?page=loopress`),
pointing the cursor at the new Loopress menu and the plugin card. It reuses the wp-admin
session `run()` saved, so no login screen flashes.

Each call records its own webm into `video_dir`.
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

WP_URL = os.environ.get("WP_URL", "http://localhost:8080").rstrip("/")
WP_HOST = WP_URL.split("//", 1)[-1]
WP_USER = os.environ.get("WP_ADMIN_USER", "admin")
WP_PASS = os.environ.get("WP_ADMIN_PASS", "admin")

LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"]

# A fake pointer that glides toward the element we're about to act on. Playwright's real
# mouse leaves no visible cursor in a headless recording, so we draw our own.
_CURSOR_INIT_JS = r"""
() => {
  if (document.getElementById('__lps_cur')) return;
  const c = document.createElement('div');
  c.id = '__lps_cur';
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M4 2l5.5 15.5 2.3-6.2 6.2-2.3L4 2z" fill="#ffffff" stroke="#1e1e2e" '
    + 'stroke-width="1.5" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, {
    position: 'fixed', left: '48%', top: '58%', zIndex: '2147483647', pointerEvents: 'none',
    transition: 'left .55s cubic-bezier(.35,0,.25,1), top .55s cubic-bezier(.35,0,.25,1)',
    filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.45))', willChange: 'left, top',
  });
  document.body.appendChild(c);
}
"""

_CURSOR_MOVE_JS = r"""
(sel) => {
  const c = document.getElementById('__lps_cur');
  const el = document.querySelector(sel);
  if (!c || !el) return;
  el.scrollIntoView({block: 'center', inline: 'center'});
  const r = el.getBoundingClientRect();
  c.style.left = (r.left + r.width / 2) + 'px';
  c.style.top = (r.top + r.height * 0.55) + 'px';
}
"""

_CURSOR_CLICK_JS = r"""
() => {
  const c = document.getElementById('__lps_cur');
  if (!c) return;
  const x = parseFloat(c.style.left) || 0, y = parseFloat(c.style.top) || 0;
  const rip = document.createElement('div');
  Object.assign(rip.style, {
    position: 'fixed', left: (x - 7) + 'px', top: (y - 7) + 'px', width: '14px', height: '14px',
    borderRadius: '50%', border: '2px solid #89b4fa', zIndex: '2147483646', pointerEvents: 'none',
    transform: 'scale(1)', opacity: '0.9', transition: 'transform .45s ease-out, opacity .45s ease-out',
  });
  document.body.appendChild(rip);
  requestAnimationFrame(() => { rip.style.transform = 'scale(3.4)'; rip.style.opacity = '0'; });
  setTimeout(() => rip.remove(), 550);
  c.animate([{transform: 'scale(1)'}, {transform: 'scale(.82)'}, {transform: 'scale(1)'}], {duration: 240});
}
"""


def _point_at(page, selector, settle=0.9, click=False):
    """Glide the fake cursor to `selector`; optionally play a click ripple there."""
    try:
        page.evaluate(_CURSOR_INIT_JS)
        page.evaluate(_CURSOR_MOVE_JS, selector)
        time.sleep(0.65)          # let the CSS glide finish
        if click:
            page.evaluate(_CURSOR_CLICK_JS)
            time.sleep(0.35)
        time.sleep(settle)
    except Exception:
        pass


def _launch(p):
    # System Chrome/Edge first (matches what the CLI's own installer uses); bundled
    # Chromium as the fallback so the folder works without Chrome installed.
    for channel in ("chrome", "msedge"):
        try:
            return p.chromium.launch(channel=channel, headless=True, args=LAUNCH_ARGS)
        except Exception:
            pass
    return p.chromium.launch(headless=True, args=LAUNCH_ARGS)


def _state_file(video_dir):
    return os.path.join(os.path.dirname(os.path.normpath(video_dir)), "wp-state.json")


def _context(browser, video_dir, storage_state=None):
    kw = dict(
        viewport={"width": 1280, "height": 800},
        device_scale_factor=1,
        record_video_dir=video_dir,
        record_video_size={"width": 1280, "height": 800},
    )
    if storage_state and os.path.exists(storage_state):
        kw["storage_state"] = storage_state
    return browser.new_context(**kw)


def _login(page):
    if "wp-login.php" in page.url:
        page.wait_for_selector("#user_login", timeout=15000)
        page.fill("#user_login", WP_USER)
        page.fill("#user_pass", WP_PASS)
        time.sleep(1.0)
        page.click("#wp-submit")
        page.wait_for_load_state("domcontentloaded")


def run(auth_url: str, video_dir: str) -> str:
    with sync_playwright() as p:
        browser = _launch(p)
        ctx = _context(browser, video_dir)
        page = ctx.new_page()

        # api.loopress.dev relay -> <meta refresh> -> wp-admin/authorize-application.php
        page.goto(auth_url, wait_until="domcontentloaded")
        page.wait_for_url(f"**{WP_HOST}/**", timeout=20000)
        _login(page)

        # The "Authorize application" consent screen: cursor to the app name, then the button.
        page.wait_for_selector("#approve", timeout=20000)
        page.wait_for_load_state("networkidle")
        time.sleep(0.8)
        _point_at(page, "#app_name", settle=0.7)
        _point_at(page, "#approve", settle=0.4, click=True)
        page.click("#approve")

        # WordPress -> api.loopress.dev/auth/wp-callback -> auto-POST to the CLI's
        # 127.0.0.1 callback server -> "Authorization successful!" page.
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(2.0)  # hold the success message

        # Keep the wp-admin session so plugin_page() doesn't have to log in again.
        # (Landing back on the dashboard happens at the start of plugin_page(), which runs
        # after the install, so the CLI isn't left waiting on this browser during it.)
        try:
            ctx.storage_state(path=_state_file(video_dir))
        except Exception:
            pass

        video = page.video
        ctx.close()
        browser.close()
        return video.path() if video else ""


def plugin_page(video_dir: str) -> str:
    """Open the Loopress Full admin page (top-level menu slug 'loopress')."""
    with sync_playwright() as p:
        browser = _launch(p)
        ctx = _context(browser, video_dir, storage_state=_state_file(video_dir))
        page = ctx.new_page()

        # First, back on the wp-admin dashboard (the "return to WordPress home" beat).
        page.goto(f"{WP_URL}/wp-admin/", wait_until="domcontentloaded")
        _login(page)  # fallback only: the saved session should land us straight in
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(1.6)

        # Then the plugin's own page.
        page.goto(f"{WP_URL}/wp-admin/admin.php?page=loopress", wait_until="domcontentloaded")
        if "page=loopress" not in page.url:
            page.goto(f"{WP_URL}/wp-admin/admin.php?page=loopress", wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(0.9)
        _point_at(page, "#toplevel_page_loopress", settle=0.9)   # the new Loopress menu
        _point_at(page, "#wpbody-content h1", settle=1.1)        # the "Loopress Full" card
        time.sleep(0.8)

        video = page.video
        ctx.close()
        browser.close()
        return video.path() if video else ""


if __name__ == "__main__":
    if sys.argv[1] == "plugin":
        print(plugin_page(sys.argv[2]))
    else:
        print(run(sys.argv[1], sys.argv[2]))
