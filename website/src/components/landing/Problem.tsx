const PAINS = [
  { code: "SNP", text: "Snippets edited in the admin, no history, no rollback" },
  { code: "PLG", text: "Plugin versions are ad hoc, no lockfile, no reproducible installs" },
  { code: "STY", text: "Global Styles tweaked in the editor, lost on theme updates" },
  { code: "DEP", text: "Composer packages require SSH to install" },
];

export function Problem() {
  return (
    <section id="problem" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>01 · The Problem</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          WordPress wasn't built for modern development workflows.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Snippets edited in the admin. Plugin versions untracked. Theme styles overwritten. PHP packages requiring SSH. Problems solved everywhere else, still open in WordPress.
        </p>

        <div className="mt-14 grid gap-10 md:grid-cols-2">
          <ul className="space-y-2">
            {PAINS.map((p) => (
              <li
                key={p.code}
                className="group flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-4 py-3.5 transition-colors hover:border-border hover:bg-card/70"
              >
                <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-destructive">
                  {p.code}
                </span>
                <span className="text-sm text-foreground/90">{p.text}</span>
              </li>
            ))}
          </ul>

          <ComparisonCard />
        </div>
      </div>
    </section>
  );
}

function ComparisonCard() {
  const modern = ["Git history", "Code review", "One-command deploy", "Composer lockfile"];
  const wp = [
    "Admin UI edits, no diff",
    "SSH to install a package",
    "No rollback on snippets",
    "Manual server setup",
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/80 bg-card/40 font-mono text-xs">
      <div className="border-r border-border/80 p-5">
        <div className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          Modern Applications
        </div>
        <ul className="space-y-2.5">
          {modern.map((m) => (
            <li key={m} className="flex items-center gap-2 text-foreground">
              <span className="text-success">✓</span>
              {m}
            </li>
          ))}
        </ul>
      </div>
      <div className="p-5">
        <div className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          WordPress
        </div>
        <ul className="space-y-2.5">
          {wp.map((m) => (
            <li key={m} className="flex items-start gap-2 text-foreground/80">
              <span className="mt-0.5 text-destructive">✗</span>
              {m}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-cyan">
      <span className="h-px w-6 bg-accent-cyan/50" />
      {children}
    </div>
  );
}