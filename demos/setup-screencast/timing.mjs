// Timing math for build.sh, kept out of the shell so the pipeline needs only Node.
//
//   node timing.mjs reshape <src.cast> <dst.cast> <gapcap>
//       Reshape the asciinema cast: real time through the browser-auth window, sped up
//       before and after, harder still through `npm install`. Prints:
//         <final terminal duration> <compressed "Opening WordPress" time> <compressed install time>
//
//   node timing.mjs layout <auth> <d1> <d2> <inst> <term>
//       Browser/terminal timeline from the two clip durations. Prints:
//         <gap1> <browser total> <final> <browser tail> <terminal tail> <dim start> <dim end>
//
//   node timing.mjs poster <auth>
//       Frame number for the poster (auth hand-off + 7s, at 30fps).
import {readFileSync, writeFileSync} from 'node:fs'
import {argv, stdout} from 'node:process'

const F_PRE = 0.55
const F_POST = 0.6
const F_NPM = 0.22
const PROT_CAP = 16 // bound a pathologically slow browser-auth stretch (loaded machine)

function reshape(src, dst, gapcap) {
  const cap = Number.parseFloat(gapcap)
  const lines = readFileSync(src, 'utf8').split('\n').filter((line) => line.trim())
  const header = lines[0]
  const events = lines.slice(1).map((line) => JSON.parse(line))

  const find = (needle, after = 0) => {
    for (const [time, , data] of events) {
      if (time >= after && data.includes(needle)) return time
    }
    return null
  }

  // Keep real time for the whole browser-auth wait: from "Opening WordPress..." until the
  // CLI gets the callback back. Everything before (npm, prompts) and after (the install log)
  // is sped up.
  const tOpen = find('Opening WordPress in your browser')
  const tBack = find('Downloading the latest Loopress Full') ?? find('configured') ?? tOpen + 16
  const lo = tOpen - 0.5
  const hi = tBack + 0.5

  const npmLo = find('npm install -g @loopress/cli')
  const npmHi = find('packages in ', npmLo ?? 0)
  const tInstalled = find('Loopress Full installed and activated')

  const out = []
  let prevRaw = 0
  let acc = 0
  let compOpen = null
  let compInstalled = null

  for (const [time, type, data] of events) {
    let dt = time - prevRaw
    prevRaw = time
    const isProtected = lo <= time && time <= hi
    if (!isProtected && dt > cap) dt = cap
    if (isProtected && dt > PROT_CAP) dt = PROT_CAP

    let speed
    if (isProtected) speed = 1
    else if (npmLo !== null && npmHi !== null && npmLo <= time && time <= npmHi) speed = F_NPM
    else if (time <= lo) speed = F_PRE
    else speed = F_POST

    acc += dt * speed
    const nt = Math.round(acc * 1e6) / 1e6
    if (compOpen === null && data.includes('Opening WordPress in your browser')) compOpen = nt
    if (compInstalled === null && tInstalled !== null && time >= tInstalled) compInstalled = nt
    out.push([nt, type, data])
  }

  // Drop the "exit" the shell echoes when it gets EOF: keep everything up to the last prompt.
  let lastPrompt = out.length - 1
  for (let i = 0; i < out.length; i += 1) {
    if (String(out[i][2]).includes('site$ ')) lastPrompt = i
  }
  const trimmed = out.slice(0, lastPrompt + 1)

  writeFileSync(dst, `${header}\n${trimmed.map((event) => JSON.stringify(event)).join('\n')}\n`)

  const last = trimmed[trimmed.length - 1][0]
  stdout.write(`${last.toFixed(3)} ${compOpen.toFixed(3)} ${(compInstalled ?? last).toFixed(3)}\n`)
}

function layout(authArg, d1Arg, d2Arg, instArg, termArg) {
  const [auth, d1, d2, inst, term] = [authArg, d1Arg, d2Arg, instArg, termArg].map(Number.parseFloat)
  const gap1 = Math.max(0.3, inst - auth - d1)
  const browserDur = auth + d1 + gap1 + d2
  const final = Math.max(term, browserDur)
  // dim the browser pane once the terminal takes over; start it a touch before the freeze
  const dimA = Math.max(auth, auth + d1 - 0.5)
  const dimB = auth + d1 + gap1
  const fields = [gap1, browserDur, final, final - browserDur, final - term, dimA, dimB]
  stdout.write(`${fields.map((n) => n.toFixed(3)).join(' ')}\n`)
}

function poster(authArg) {
  stdout.write(`${Math.trunc((Number.parseFloat(authArg) + 7) * 30)}\n`)
}

const [mode, ...rest] = argv.slice(2)
if (mode === 'reshape') reshape(rest[0], rest[1], rest[2])
else if (mode === 'layout') layout(rest[0], rest[1], rest[2], rest[3], rest[4])
else if (mode === 'poster') poster(rest[0])
else {
  console.error(`unknown mode: ${mode}`)
  process.exit(2)
}
