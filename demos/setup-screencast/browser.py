"""Browser side of the screencast.

`run()` drives the WordPress Application-Password authorization: logs into wp-admin, lands
on the "Authorize application" page, moves a fake cursor to the app-name field then the
approve button, approves it, holds the success message, and lands back on the wp-admin
dashboard - all before the CLI installs the plugin.

`plugin_page()` is called afterwards, once the CLI has installed Loopress Full: it refreshes
the dashboard so the new Loopress menu appears, then clicks that menu with the cursor to
reach the plugin's admin page. It reuses the wp-admin session `run()` saved.

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
# mouse leaves no visible cursor in a headless recording, so we draw our own. On first use
# it pops in right next to the target (no long travel from the centre of the page).
_CURSOR_MOVE_JS = r"""
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
    transform: 'scale(1)', opacity: '0.9', transition: 'transform .3s ease-out, opacity .3s ease-out',
  });
  document.body.appendChild(rip);
  requestAnimationFrame(() => { rip.style.transform = 'scale(3.2)'; rip.style.opacity = '0'; });
  setTimeout(() => rip.remove(), 360);
  c.animate([{transform: 'scale(1)'}, {transform: 'scale(.82)'}, {transform: 'scale(1)'}], {duration: 170});
}
"""


def _point_at(page, selector, settle=0.4, click=False):
    """Show / glide the fake cursor to `selector`; optionally play a click ripple there."""
    try:
        page.evaluate(_CURSOR_MOVE_JS, selector)
        time.sleep(0.24)          # short glide
        if click:
            page.evaluate(_CURSOR_CLICK_JS)
            time.sleep(0.16)
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
        time.sleep(0.4)
        _point_at(page, "#app_name", settle=0.3)
        _point_at(page, "#approve", settle=0.2, click=True)
        page.click("#approve")

        # WordPress -> api.loopress.dev/auth/wp-callback -> auto-POST to the CLI's
        # 127.0.0.1 callback server -> "Authorization successful!" page.
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(2.0)  # hold the success message

        # Back on the wp-admin dashboard, before the CLI installs the plugin. The CLI is
        # parked on its "Install it now?" prompt while this runs, so keep it short:
        # domcontentloaded is enough to show the dashboard, then hand focus back fast.
        page.goto(f"{WP_URL}/wp-admin/", wait_until="domcontentloaded")
        time.sleep(0.25)

        # Keep the wp-admin session so plugin_page() doesn't have to log in again.
        try:
            ctx.storage_state(path=_state_file(video_dir))
        except Exception:
            pass

        video = page.video
        ctx.close()
        browser.close()
        return video.path() if video else ""


MENU_LINK = "#toplevel_page_loopress > a"


def plugin_page(video_dir: str) -> str:
    """Called once the CLI has installed Loopress Full: refresh the dashboard so its new
    menu shows up, then click through to the plugin's admin page with the cursor."""
    with sync_playwright() as p:
        browser = _launch(p)
        ctx = _context(browser, video_dir, storage_state=_state_file(video_dir))
        page = ctx.new_page()

        # Back on the dashboard (session reused), then refresh now that the install is
        # done - the new "Loopress" menu appears in the sidebar.
        page.goto(f"{WP_URL}/wp-admin/", wait_until="domcontentloaded")
        _login(page)  # fallback only
        time.sleep(0.4)
        page.reload(wait_until="domcontentloaded")
        try:
            page.wait_for_selector(MENU_LINK, timeout=15000)
        except Exception:
            pass
        time.sleep(0.6)

        # Navigate to the plugin's page with the mouse: cursor to the Loopress menu, click.
        _point_at(page, MENU_LINK, settle=0.2, click=True)
        try:
            page.click(MENU_LINK)
            page.wait_for_url("**page=loopress**", timeout=15000)
        except Exception:
            page.goto(f"{WP_URL}/wp-admin/admin.php?page=loopress", wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(0.5)
        _point_at(page, "#wpbody-content h1", settle=0.7)   # the "Loopress Full" card
        time.sleep(0.5)

        video = page.video
        ctx.close()
        browser.close()
        return video.path() if video else ""


if __name__ == "__main__":
    if sys.argv[1] == "plugin":
        print(plugin_page(sys.argv[2]))
    else:
        print(run(sys.argv[1], sys.argv[2]))
