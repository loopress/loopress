import { SectionLabel } from "./Problem";

const PILLARS = [
  { t: "Snippets in Git", d: "Pull snippets as .php files, edit them locally, commit, push back." },
  { t: "Composer without SSH", d: "Search and install Packagist packages from the WordPress admin panel." },
];

const COMPAT = ["Code Snippets", "WPCode", "Git", "Composer", "Packagist"];

export function Solution() {
  return (
    <section id="solution" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>02 · The Solution</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Two tools. Two problems solved.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A CLI to version-control your snippets, and a WordPress plugin to install PHP packages without touching the server.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 md:grid-cols-2">
          {PILLARS.map((p, i) => (
            <div key={p.t} className="group relative bg-card/60 p-6 transition-colors hover:bg-card">
              <div className="font-mono text-[10px] text-muted-foreground">
                0{i + 1}
              </div>
              <div className="mt-3 text-base font-medium text-foreground">{p.t}</div>
              <div className="mt-1.5 text-sm text-muted-foreground">{p.d}</div>
              <div className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start gap-4 md:flex-row md:items-center">
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