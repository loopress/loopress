# demos

Screencast recorders for the marketing site. Web clips are recorded with Playwright, terminal
clips with [vhs](https://github.com/charmbracelet/vhs). Output is post-processed into an mp4,
a webm and a poster frame you drop into `website/src/assets/demos/`.

This is **not** part of `pnpm test:e2e`. It reuses `e2e/helpers/` (auto wp-admin login,
isolated CLI config) but its job is video, not assertions.

## Prerequisites

- A real, disposable WordPress instance with Loopress Full active. The `loopress/setup-ci`
  Docker stack works locally, see `e2e/README.md`.
- `ffmpeg` (`brew install ffmpeg`).
- `vhs` for the terminal tapes (`brew install vhs`). Optional: `build.sh` skips them if absent.
- The built CLI: `pnpm --filter @loopress/cli build` (the `pnpm demos` script does this first).

## Run

```bash
export WP_URL=http://your-site.local
export WP_USERNAME=admin
export WP_APP_PASSWORD=xxxxxxxxxxxxxxxxxxxx   # REST application password, no spaces
export WP_ADMIN_PASSWORD=admin               # real wp-admin account password (browser login)

pnpm demos                    # all clips
pnpm demos apps-in-a-page     # one spec by name
```

Raw recordings land in `demos/.out/`, deliverables in `demos/.out/final/`. Nothing under
`.out/` is committed; the finished clip you pick goes in `website/src/assets/demos/`.

## Files

| Path | What |
| --- | --- |
| `playwright.demos.config.ts` (repo root) | Records at 1440x900, `video: on`, no retries. `testMatch` is `*.demo.ts`. |
| `apps-in-a-page.demo.ts` | Web: a built SPA pushed with `lps app push`, rendering and filtering inside a published page. |
| `fixtures/search-app/` | A hand-written built SPA (no build step). It *is* the `dist/` that gets pushed. |
| `lib/cursor.ts` | Injected CSS pointer that follows `page.mouse.*` (Playwright video has no OS cursor). |
| `lib/pace.ts` | `beat` / `hold` / `typeHuman` timing helpers. Use only these so takes stay consistent. |
| `terminal/app-push.tape` | Terminal: `lps app push` / `lps app list`. |
| `terminal/prepare.sh` | Scaffolds a throwaway project + config from `WP_*`; `eval "$(...)"` it before `vhs`. |
| `build.sh` | Runs both, then ffmpeg -> mp4 + webm + poster. |

## Add a web demo

Drop `demos/<name>.demo.ts`. Import `{expect, test}` from `../e2e/helpers/environment.js` for
the WP fixture, `installCursor` + `glideTo` from `./lib/cursor.js`, `beat`/`hold`/`typeHuman`
from `./lib/pace.js`. Save the clip in a `finally` block:

```ts
const video = page.video()
await page.close()
if (video) await video.saveAs(join(OUT, '<name>.webm'))
```

## Embed in the hero

```html
<video autoplay muted loop playsinline poster="/assets/demos/apps-in-a-page.poster.jpg">
  <source src="/assets/demos/apps-in-a-page.webm" type="video/webm" />
  <source src="/assets/demos/apps-in-a-page.mp4" type="video/mp4" />
</video>
```

## Note

No `*.demo.ts` self-check ships here: exercising `cursor.ts` / the pacing helpers needs a
browser and a live WordPress, which is exactly what running the demo does. The
`apps-in-a-page` spec asserts `[data-demo-cursor]` is attached, so a broken cursor lib fails
the recording rather than shipping a cursorless clip.
