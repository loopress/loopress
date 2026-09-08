import { TerminalOnboarding } from "./TerminalOnboarding";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 grid-bg radial-fade opacity-70" aria-hidden />
      <div
        className="absolute left-1/4 top-0 -z-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_200/0.15),transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:items-center lg:gap-16">
          <div>
            <p className="font-mono text-sm text-accent-cyan-ink">The Git layer for WordPress</p>

            <h1 className="mt-3 text-balance text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
              Your WordPress sites, under version control.
            </h1>

            <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground md:text-xl">
              Clone the theme, hooks, plugin versions and Composer deps to files. Review them in a
              PR, push them back. The content and the database stay where they are.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="https://docs.loopress.dev"
                className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Read the docs
                <span className="ml-2 text-base">→</span>
              </a>
              <a
                href="https://github.com/loopress"
                className="inline-flex h-10 items-center rounded-md border border-border bg-card/40 px-5 text-sm font-medium text-foreground transition-colors hover:bg-card"
              >
                View on GitHub
              </a>
            </div>
          </div>

          <div className="min-w-0">
            <TerminalOnboarding />
          </div>
        </div>
      </div>
    </section>
  );
}
