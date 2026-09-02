#!/bin/bash
# One-time dependency setup for the screencast. Idempotent-ish. Run from the folder:
#
#   ./setup.sh
#
# Needs (not installed here): docker + docker compose, node + npm.
set -euo pipefail
cd "$(dirname "$0")"

OS="$(uname -s)"
AGG_VER=1.5.0

have() { command -v "$1" >/dev/null 2>&1; }

echo "== checking docker / node =="
have docker || { echo "!! install Docker Desktop / docker first"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "!! need 'docker compose' v2"; exit 1; }
have node || { echo "!! install node + npm first"; exit 1; }

if [ "$OS" = Darwin ]; then
  echo "== macOS: brew packages =="
  have brew || { echo "!! install Homebrew first (https://brew.sh)"; exit 1; }
  brew list ffmpeg   >/dev/null 2>&1 || brew install ffmpeg
  brew list asciinema >/dev/null 2>&1 || brew install asciinema
  brew list --cask font-jetbrains-mono >/dev/null 2>&1 || brew install --cask font-jetbrains-mono || true
  have google-chrome || [ -d "/Applications/Google Chrome.app" ] || \
    echo "   note: install Google Chrome for the CLI's own plugin-install step (brew install --cask google-chrome)"
  AGG_ARCH="$([ "$(uname -m)" = arm64 ] && echo aarch64-apple-darwin || echo x86_64-apple-darwin)"
else
  echo "== Linux: apt packages =="
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO=sudo
  $SUDO apt-get update -qq
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    ffmpeg fonts-jetbrains-mono asciinema python3-venv python3-pip curl ca-certificates
  if ! have google-chrome && ! have google-chrome-stable; then
    curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/chrome.deb
  fi
  # Chrome's sandbox needs a non-root uid; make a throwaway "demo" user when running as root.
  if [ "$(id -u)" = 0 ] && ! id demo >/dev/null 2>&1; then
    useradd -m -s /bin/bash demo
    sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 2>/dev/null || true
    chown -R demo:demo "$(pwd)"
  fi
  AGG_ARCH=x86_64-unknown-linux-gnu
fi

echo "== agg (asciinema -> gif) =="
if [ ! -x ./bin-agg ]; then
  curl -fsSL -o ./bin-agg \
    "https://github.com/asciinema/agg/releases/download/v${AGG_VER}/agg-${AGG_ARCH}"
  chmod +x ./bin-agg
fi
./bin-agg --version

echo "== python venv (pexpect + playwright) =="
[ -d venv ] || python3 -m venv venv
./venv/bin/pip -q install --upgrade pip
./venv/bin/pip -q install pexpect playwright
./venv/bin/playwright install chromium >/dev/null   # fallback browser for browser.py

[ "$OS" = Darwin ] || { [ "$(id -u)" = 0 ] && id demo >/dev/null 2>&1 && chown -R demo:demo "$(pwd)"; }

echo
echo "setup done. next:  ./record.sh"
