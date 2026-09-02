# Loopress setup screencast

Records the Loopress onboarding as one side-by-side clip: a terminal running
`npm install -g @loopress/cli` then `lps project config`, next to a real Chrome
approving the WordPress Application Password and the automatic Loopress Full install.

Everything runs against a throwaway WordPress (official `wordpress` image), nothing
touches your real npm prefix or `~/.config/loopress`.

## Requirements

- Docker + `docker compose` v2
- Node + npm
- macOS: Homebrew. Linux: apt (Debian/Ubuntu). `setup.sh` installs the rest.

## Use

```bash
./setup.sh          # one time: ffmpeg, asciinema, agg, JetBrains Mono, a python venv, Chrome
./record.sh         # fresh WordPress -> record -> stitch  (~3-4 min, images cached)
WEBM=1 ./record.sh  # also encode the vp9 .webm (~+2-3 min)
```

Output:

- `out/final/setup.mp4` - the clip (h264)
- `out/final/setup.poster.jpg` - a poster frame
- `out/final/setup.webm` - only with `WEBM=1`

First run pulls the `wordpress` + `mariadb` + `wordpress:cli` images (~2 min extra, once).

## Pieces

| file | role |
|---|---|
| `record.sh` | the one command: `wp-setup` -> `reset-wp` -> `run` -> `build` |
| `wp-setup.sh` | brings the stack up, installs WP core, permalinks, `WP_ENVIRONMENT_TYPE=local`, wp-content perms |
| `reset-wp.sh` | removes any `loopress*` plugin + leftover temp admins between takes |
| `run.sh` -> `orchestrate.py` | drives `lps project config` in a PTY, answers prompts, records `out/term.cast` |
| `browser.py` | Playwright: logs into wp-admin, approves the consent screen, records `out/video/*.webm` |
| `build.sh` | shapes the cast timing, renders it with `agg`, composites the two panes with ffmpeg |
| `compose.yml`, `uploads.ini` | the WordPress stack (`upload_max_filesize` bumped so the plugin zip fits) |
| `lib.sh` | shared paths / `docker compose` wrapper / Chrome-needs-non-root handling |

## Tuning (top of `build.sh`)

- `F_PRE` / `F_POST` / `F_NPM` - playback speed of the pre-auth part, the closing part, and
  the `npm install` stretch (default 0.22, i.e. ~5x).
- `GAPCAP` - cap on idle gaps outside the browser window.
- `--rows` / `--font-size` on the `agg` line - terminal pane proportions.
- The real-time (un-sped) window is `["Opening WordPress..." .. "Downloading the latest..."]`
  so the two panes stay in sync across the authorization.

## Notes

- The browser authorization is relayed through `https://api.loopress.dev` (WordPress needs an
  https `success_url`). It works against a `localhost` site because only the browser talks to
  localhost. Needs outbound internet.
- On a root Linux host `setup.sh` creates an unprivileged `demo` user and the scripts shell
  out to it (Chrome refuses to run as root). On macOS everything runs as you.
