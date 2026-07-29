import { SectionLabel } from "./Problem";

const RESOLUTIONS = [
  { code: "SNP", text: "Pulled as .php files, pushed back as commits: diffable, revertable" },
  { code: "PLG", text: "Declared in loopress.json, a lockfile for WordPress plugins" },
  { code: "DEP", text: "Installed from the WordPress admin via Composer, no SSH" },
];

export function Solution() {
  return (
    <section id="solution" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>02 · The Solution</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          One CLI. One plugin. Every workflow.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">Same three problems, resolved:</p>
        <ul className="mt-6 max-w-2xl space-y-2">
          {RESOLUTIONS.map((r) => (
            <li
              key={r.code}
              className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-4 py-3.5"
            >
              <span className="rounded border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-success-ink">
                {r.code}
              </span>
              <span className="text-sm text-foreground/90">{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
