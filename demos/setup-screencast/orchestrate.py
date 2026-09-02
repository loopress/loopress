#!/usr/bin/env python3
"""Screencast orchestrator for the Loopress setup flow.

Records one asciinema cast of a shell where we `npm install -g @loopress/cli` and then run
`lps project config`, answering every prompt. When the CLI prints the browser-authorization
URL, we drive Chrome through the WordPress "Authorize application" screen (browser.py) and
record that to a webm. build.sh stitches the two into a side-by-side clip.

Everything is isolated under <this dir>/state so it never touches a real npm prefix or a
real ~/.config/loopress.
"""
import os
import shutil
import sys
import time

import pexpect

import browser

BASE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(BASE, "site")          # cwd for `lps` (an empty project dir)
STATE = os.path.join(BASE, "state")        # throwaway npm prefix + XDG dirs
OUT = os.path.join(BASE, "out")
CAST = os.path.join(OUT, "term.cast")
VIDEO_DIR = os.path.join(OUT, "video")

WP_URL = os.environ.get("WP_URL", "http://localhost:8080")
COLS, ROWS = 100, 22

NPM_PREFIX = os.path.join(STATE, "npm-global")

ENV = {
    "HOME": os.environ.get("HOME", STATE),
    "PATH": os.pathsep.join([os.path.join(NPM_PREFIX, "bin"), os.environ.get("PATH", "/usr/bin:/bin")]),
    "npm_config_prefix": NPM_PREFIX,       # `npm install -g` lands here, no sudo, wiped each run
    "npm_config_fund": "false",
    "npm_config_audit": "false",
    "npm_config_progress": "false",
    "npm_config_prefer_offline": "true",
    "XDG_CONFIG_HOME": os.path.join(STATE, ".config"),
    "XDG_DATA_HOME": os.path.join(STATE, ".local", "share"),
    "XDG_CACHE_HOME": os.path.join(STATE, ".cache"),
    "TERM": "xterm-256color",
    "LANG": "C.UTF-8",
    "PS1": r"demo@wp:~/site\$ ",
    "BROWSER": "true",                     # so xdg-open from the CLI is a silent no-op
    "NO_UPDATE_NOTIFIER": "1",
}


def reset_state():
    for d in (SITE, STATE, VIDEO_DIR):
        shutil.rmtree(d, ignore_errors=True)
    for f in (os.path.join(OUT, "wp-state.json"),):
        try:
            os.remove(f)
        except OSError:
            pass
    os.makedirs(SITE, exist_ok=True)
    os.makedirs(os.path.join(STATE, ".config", "loopress"), exist_ok=True)
    os.makedirs(os.path.join(NPM_PREFIX, "bin"), exist_ok=True)
    os.makedirs(VIDEO_DIR, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    # Pre-seed only telemetry, so the CLI still sees zero projects but never prompts about it.
    with open(os.path.join(STATE, ".config", "loopress", "config.json"), "w") as fh:
        fh.write('{"telemetry":{"disabled":true},"projects":{}}\n')


def type_line(child, text, cps=55):
    """Send keystrokes one at a time so the tty echo looks like real typing."""
    for ch in text:
        child.send(ch)
        time.sleep(1.0 / cps)
    child.send("\r")


def main():
    reset_state()

    child = pexpect.spawn(
        "asciinema",
        ["rec", "-q", "--overwrite", "--cols", str(COLS), "--rows", str(ROWS),
         "-c", "/bin/bash --norc -i", CAST],
        env=ENV, cwd=SITE, dimensions=(ROWS, COLS), encoding="utf-8", timeout=60,
    )
    child.logfile_read = sys.stdout

    child.expect_exact("site$ ", timeout=20)
    time.sleep(0.5)

    # 1. Install the CLI from npm (into the isolated prefix set in ENV).
    type_line(child, "npm install -g @loopress/cli")
    child.expect_exact("site$ ", timeout=240)
    time.sleep(0.7)

    # 2. lps project config -- connect a WordPress environment.
    type_line(child, "lps project config")

    child.expect("Project name", timeout=20)
    time.sleep(0.4); type_line(child, "Demo Site")

    child.expect("Environment", timeout=15)
    time.sleep(0.4); child.send("\r")                       # select: local (default)

    child.expect("WordPress URL", timeout=15)
    time.sleep(0.4); type_line(child, WP_URL)

    child.expect("authenticate", timeout=15)
    time.sleep(0.4); child.send("\r")                       # Authorize in my browser (recommended)

    child.expect(r"visit:[\r\n]+(https?://\S+)", timeout=30)
    auth_url = child.match.group(1).strip()
    print(f"\n[orchestrator] auth url: {auth_url}\n", file=sys.stderr)

    # 3. Approve the Application Password in the browser (recorded to webm).
    webm = browser.run(auth_url, VIDEO_DIR)
    print(f"[orchestrator] browser video: {webm}", file=sys.stderr)

    # 4. Back in the terminal: auto-install Loopress Full.
    child.expect("configured", timeout=30)
    child.expect("Loopress Full was not detected", timeout=30)
    child.expect(r"\(Y/n\)", timeout=8)
    time.sleep(0.4); child.send("\r")                       # install it now? yes

    child.expect("Downloading the latest Loopress Full release", timeout=20)
    idx = child.expect(["Loopress Full installed and activated",
                        "Could not install Loopress Full"], timeout=180)
    if idx == 1:
        raise SystemExit("Loopress Full auto-install failed")
    child.expect("Removing the temporary admin account", timeout=30)
    child.expect(r"lps project switch", timeout=20)         # closing hint -> command done

    time.sleep(1.0)
    child.send("\r")
    type_line(child, "exit")
    child.expect(pexpect.EOF, timeout=15)

    # 5. Now that Loopress Full is installed, show its admin page in the browser.
    print("[orchestrator] opening the Loopress plugin page...", file=sys.stderr)
    plugin_webm = browser.plugin_page(VIDEO_DIR)
    print(f"[orchestrator] plugin-page video: {plugin_webm}", file=sys.stderr)

    print("\n[orchestrator] done", file=sys.stderr)


if __name__ == "__main__":
    main()
