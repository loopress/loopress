"""Drives the WordPress Application-Password authorization screen for the screencast.

Called by orchestrate.py with the auth URL that `lps project config` prints. Logs into
wp-admin, lands on the "Authorize application" page, approves it, and lets WordPress relay
the credentials back to the CLI's local callback server. Records the whole thing to a webm.
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

WP_USER = os.environ.get("WP_ADMIN_USER", "admin")
WP_PASS = os.environ.get("WP_ADMIN_PASS", "admin")
WP_HOST = os.environ.get("WP_URL", "http://localhost:8080").split("//", 1)[-1]

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


def run(auth_url: str, video_dir: str) -> str:
    with sync_playwright() as p:
        browser = _launch(p)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1,
            record_video_dir=video_dir,
            record_video_size={"width": 1280, "height": 800},
        )
        page = ctx.new_page()

        # api.loopress.dev relay -> <meta refresh> -> wp-admin/authorize-application.php
        page.goto(auth_url, wait_until="domcontentloaded")
        page.wait_for_url(f"**{WP_HOST}/**", timeout=20000)

        # Fresh browser session: WordPress bounces us through the login wall first.
        if "wp-login.php" in page.url:
            page.wait_for_selector("#user_login", timeout=15000)
            page.fill("#user_login", WP_USER)
            page.fill("#user_pass", WP_PASS)
            time.sleep(1.0)
            page.click("#wp-submit")

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
        path = video.path() if video else ""
        return path


if __name__ == "__main__":
    out = run(sys.argv[1], sys.argv[2])
    print(out)
