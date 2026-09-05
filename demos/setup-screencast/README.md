# Loopress setup screencast

Records the Loopress onboarding as one side-by-side clip: a terminal running
`npm install -g @loopress/cli` then `lps project config`, next to a real Chrome
approving the WordPress Application Password and the automatic Loopress Full install.

Everything runs against a throwaway WordPress (official `wordpress` image), nothing
touches your real npm prefix or `~/.config/loopress`.

## Requirements

- Docker + `docker compose` v2
- Node + npm (Node 24+: the orchestrator is a `.ts` file run directly, no build step)
- macOS: Homebrew. Linux: apt (Debian/Ubuntu). `setup.sh` installs the rest.

This folder installs its own deps (`node-pty`, `@playwright/test`) with plain `npm`;
it is deliberately outside the pnpm workspace.

## Use

```bash
./setup.sh          # one time: ffmpeg, asciinema, agg, JetBrains Mono, node deps, Chrome
./record.sh         # fresh WordPress -> record -> stitch  (~3-4 min, images cached)
WEBM=1 ./record.sh  # also encode the vp9 .webm (~+2-3 min)
```

Output:

- `out/final/setup.mp4` - desktop clip, side by side (h264)
- `out/final/setup-mobile.mp4` - portrait, browser under the terminal (`MOBILE=0` to skip)
- `out/final/setup*.poster.jpg` - poster frames
- `out/final/setup.webm` - only with `WEBM=1`

First run pulls the `wordpress` + `mariadb` + `wordpress:cli` images (~2 min extra, once).

## Pieces

| file | role |
|---|---|
| `record.sh` | the one command: `wp-setup` -> `reset-wp` -> `run` -> `build` |
| `wp-setup.sh` | brings the stack up, installs WP core, permalinks, `WP_ENVIRONMENT_TYPE=local`, wp-content perms |
| `reset-wp.sh` | removes any `loopress*` plugin + leftover temp admins between takes |
| `run.sh` -> `orchestrate.ts` | drives `lps project config` in a PTY (`node-pty`), answers prompts, records `out/term.cast` |
| `browser.ts` | Playwright: logs into wp-admin, approves the consent screen (a fake cursor points at each element), then opens the installed plugin's page; records `out/video/*.webm` |
| `build.sh` + `timing.mjs` | shapes the cast timing, renders it with `agg`, composites the two panes with ffmpeg |
| `compose.yml`, `uploads.ini` | the WordPress stack (`upload_max_filesize` bumped so the plugin zip fits) |
| `lib.sh` | shared paths / `docker compose` wrapper / Chrome-needs-non-root handling |

## Tuning

`timing.mjs` holds the playback-speed model:

- `F_PRE` / `F_POST` / `F_NPM` - playback speed of the pre-auth part, the closing part, and
  the `npm install` stretch (default 0.22, i.e. ~5x).
- `PROT_CAP` (16s) - bounds the real-time authorization window so a slow / loaded machine
  cannot inflate the terminal side.
- The real-time (un-sped) window is `["Opening WordPress..." .. "Downloading the latest..."]`
  so the two panes stay in sync across the authorization.

`GAPCAP` (env, default 1.4) caps idle gaps outside that window. `--rows` / `--font-size` on
the `agg` line in `build.sh` set the terminal pane proportions.

## Notes

- The browser authorization is relayed through `https://api.loopress.dev` (WordPress needs an
  https `success_url`). It works against a `localhost` site because only the browser talks to
  localhost. Needs outbound internet.
- On a root Linux host `setup.sh` creates an unprivileged `demo` user and the scripts shell
  out to it (Chrome refuses to run as root). On macOS everything runs as you.
- `compose.yml` binds WordPress to `127.0.0.1:8080` only: it has hardcoded `admin`/`admin`
  credentials and is not meant to be reachable off the host.
