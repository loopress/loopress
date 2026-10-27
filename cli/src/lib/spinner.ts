// The one spinner behind every pending wait: WpClient and ApiClient requests, the browser
// callback, a build, a third-party lookup. Refcounted so overlapping waits share one line (the
// outermost label wins), on stderr and only on an interactive one, so `--json`, pipes and CI
// output never see a frame. While it spins, every stdout/stderr write clears the line first and
// redraws it after, so a this.log() mid-wait lands above it instead of on it.
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

let depth = 0
let paused = 0
let label = ''
let frame = 0
let stopSpinning: (() => void) | undefined

function isEnabled(): boolean {
  return process.stderr.isTTY && !process.env.CI
}

function start(): void {
  const rawOut = process.stdout.write
  const rawErr = process.stderr.write
  const draw = () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typed as number, but undefined when stderr is not a TTY
    const text = `${FRAMES[frame]} ${label}`.slice(0, (process.stderr.columns ?? 80) - 1)
    rawErr.call(process.stderr, `\r\u{1B}[2K${text}`)
  }

  const clear = () => rawErr.call(process.stderr, '\r\u{1B}[2K')
  const intercept =
    (stream: NodeJS.WriteStream, raw: typeof rawOut) =>
    (...args: Parameters<typeof rawOut>): boolean => {
      clear()
      const result = raw.apply(stream, args)
      draw()
      return result
    }

  // write() is overloaded, and a single rest-args wrapper can't be typed as every overload.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
  process.stdout.write = intercept(process.stdout, rawOut) as typeof rawOut
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
  process.stderr.write = intercept(process.stderr, rawErr) as typeof rawErr
  draw()
  const timer = setInterval(() => {
    frame = (frame + 1) % FRAMES.length
    draw()
  }, 80)
  timer.unref()

  stopSpinning = () => {
    clearInterval(timer)
    process.stdout.write = rawOut
    process.stderr.write = rawErr
    clear()
    stopSpinning = undefined
  }
}

export async function withSpinner<T>(message: string, work: () => Promise<T>): Promise<T> {
  if (!isEnabled()) return work()

  if (depth++ === 0) label = message
  if (paused === 0 && !stopSpinning) start()
  try {
    return await work()
  } finally {
    if (--depth === 0) stopSpinning?.()
  }
}

// For code that draws its own progress (Listr renderers, which already spin per task) or reads
// from the terminal (prompts): the spinner steps aside, then comes back if a wait is still pending.
export async function withoutSpinner<T>(work: () => Promise<T>): Promise<T> {
  paused++
  stopSpinning?.()
  try {
    return await work()
  } finally {
    if (--paused === 0 && depth > 0 && isEnabled()) start()
  }
}
