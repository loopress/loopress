import { SectionLabel } from "./Problem";

const COMPAT = [
  "Code Snippets",
  "WPCode",
  "WordPress.org",
  "Git",
  "Composer",
  "Packagist",
  "GitHub Actions",
  "GitLab CI",
];

export function Solution() {
  return (
    <section id="solution" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>02 · The Solution</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          One CLI. One plugin. Every workflow.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A CLI to version-control snippets and plugins. A WordPress plugin to manage Composer
          dependencies without touching a terminal.
        </p>

        <div className="mt-14 flex flex-col items-start gap-4 md:flex-row md:items-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Compatible with
          </span>
          <div className="flex flex-wrap gap-2">
            {COMPAT.map((c) => (
              <span
                key={c}
                className="rounded-md border border-border bg-background/60 px-2.5 py-1 font-mono text-xs text-foreground/80"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
