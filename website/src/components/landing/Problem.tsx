const PAINS = [
  {
    code: "PROD",
    text: "You edit theme and config straight in prod because local is too slow to set up",
  },
  { code: "LOG", text: "No git log for what changed on the live site, or who changed it" },
  { code: "DRIFT", text: "Plugin versions drift between environments, no lockfile to pin them" },
  { code: "SSH", text: "Composer packages need SSH the host does not give you" },
];

export function Problem() {
  return (
    <section id="problem" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>02 · The Problem</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          The live site and your repo have drifted apart.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A client site runs code and config that was never committed anywhere. Every change made in
          the admin is a change you cannot diff, review, or roll back. The safe move, test it
          locally first, is the slow one, so it does not happen.
        </p>

        <div className="mt-14 grid gap-10 md:grid-cols-2">
          <ul className="space-y-2">
            {PAINS.map((p) => (
              <li
                key={p.code}
                className="group flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-4 py-3.5 transition-colors hover:border-border hover:bg-card/70"
              >
                <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-destructive-ink">
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
  const today = [
    "FTP into prod, edit the theme in place",
    "Snippets pasted into the admin",
    '"which plugin version is on staging?"',
    "DB export to move anything",
  ];
  const withLps = [
    "git clone, edit, git push",
    "Snippets and hooks as .php files",
    "Versions pinned in loopress.json",
    "Content stays put, only code moves",
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/80 bg-card/40 font-mono text-xs">
      <div className="border-r border-border/80 p-5">
        <div className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          Today
        </div>
        <ul className="space-y-2.5">
          {today.map((m) => (
            <li key={m} className="flex items-start gap-2 text-foreground/80">
              <span className="mt-0.5 text-destructive-ink">✗</span>
              {m}
            </li>
          ))}
        </ul>
      </div>
      <div className="p-5">
        <div className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          With Loopress
        </div>
        <ul className="space-y-2.5">
          {withLps.map((m) => (
            <li key={m} className="flex items-center gap-2 text-foreground">
              <span className="text-success-ink">✓</span>
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
    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-cyan-ink">
      <span className="h-px w-6 bg-accent-cyan/50" />
      {children}
    </div>
  );
}
