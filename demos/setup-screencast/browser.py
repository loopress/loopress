"""Browser side of the screencast.

`run()` drives the WordPress Application-Password authorization: logs into wp-admin, lands
on the "Authorize application" page, approves it, and lets WordPress relay the credentials
back to the CLI's local callback server.

`plugin_page()` is called afterwards, once the CLI has installed Loopress Full: it opens the
plugin's admin page (`admin.php?page=loopress`) so the clip ends on the installed plugin.

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


def _launch(p):
    # System Chrome/Edge first (matches what the CLI's own installer uses); bundled
    # Chromium as the fallback so the folder works without Chrome installed.
    for channel in ("chrome", "msedge"):
        try:
            return p.chromium.launch(channel=channel, headless=True, args=LAUNCH_ARGS)
        except Exception:
            pass
    return p.chromium.launch(headless=True, args=LAUNCH_ARGS)


def _context(browser, video_dir):
    return browser.new_context(
        viewport={"width": 1280, "height": 800},
        device_scale_factor=1,
        record_video_dir=video_dir,
        record_video_size={"width": 1280, "height": 800},
    )


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

        # The "Authorize application" consent screen.
        page.wait_for_selector("#approve", timeout=20000)
        page.wait_for_load_state("networkidle")
        time.sleep(2.5)  # hold so the viewer can read the consent screen
        page.click("#approve")

        # WordPress -> api.loopress.dev/auth/wp-callback -> auto-POST to the CLI's
        # 127.0.0.1 callback server -> "Authorization successful!" page.
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(2.5)

        video = page.video
        ctx.close()
        browser.close()
        return video.path() if video else ""


def plugin_page(video_dir: str) -> str:
    """Open the Loopress Full admin page (top-level menu slug 'loopress')."""
    with sync_playwright() as p:
        browser = _launch(p)
        ctx = _context(browser, video_dir)
        page = ctx.new_page()

        page.goto(f"{WP_URL}/wp-admin/admin.php?page=loopress", wait_until="domcontentloaded")
        _login(page)
        if "page=loopress" not in page.url:
            page.goto(f"{WP_URL}/wp-admin/admin.php?page=loopress", wait_until="domcontentloaded")

        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(3.5)  # let the viewer see the installed plugin's page

        video = page.video
        ctx.close()
        browser.close()
        return video.path() if video else ""


if __name__ == "__main__":
    if sys.argv[1] == "plugin":
        print(plugin_page(sys.argv[2]))
    else:
        print(run(sys.argv[1], sys.argv[2]))
