import { WorkflowDiagram } from "./WorkflowDiagram";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 grid-bg radial-fade opacity-70" aria-hidden />
      <div className="absolute left-1/2 top-0 -z-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_200/0.15),transparent)]" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <a
            href="#beta"
            className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/50 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-cyan opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-cyan" />
            </span>
            Private beta - now accepting developers
            <span className="text-foreground/40">→</span>
          </a>

          <h1 className="mt-7 text-balance text-5xl font-semibold tracking-tight md:text-7xl">
            <span className="text-gradient">WordPress development,<br />without the friction.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground md:text-xl">
            Version-control your code snippets in Git. Install Composer packages from the WordPress admin, no SSH needed.
          </p>

          <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-xs text-muted-foreground sm:max-w-xl">
            <span>$ lps snippets pull</span>
            <span>$ lps snippets push</span>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://console.loopress.dev"
              className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Join the Beta
              <span className="ml-2 text-base">→</span>
            </a>
            <a
              href="https://docs.loopress.dev"
              className="inline-flex h-10 items-center rounded-md border border-border bg-card/40 px-5 text-sm font-medium text-foreground transition-colors hover:bg-card"
            >
              View Documentation
            </a>
          </div>
        </div>

        <div className="relative mx-auto mt-20 max-w-5xl">
          <WorkflowDiagram />
        </div>
      </div>
    </section>
  );
}