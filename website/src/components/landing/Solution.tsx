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

const COMPARISON_ROWS: {
  label: string;
  ftp: string;
  bedrock: string;
  dbSync: string;
  loopress: string;
}[] = [
  {
    label: "Version-controlled",
    ftp: "✗",
    bedrock: "✓ (code only)",
    dbSync: "✗ (a DB snapshot)",
    loopress: "✓",
  },
  {
    label: "Works on your host's stock wp-content",
    ftp: "✓",
    bedrock: "✗ restructures to web/",
    dbSync: "✓",
    loopress: "✓",
  },
  {
    label: "No SSH required",
    ftp: "✓",
    bedrock: "✗ typically needs it (Trellis/Capistrano-style)",
    dbSync: "✓ (plugin UI)",
    loopress: "✓ always",
  },
  {
    label: "Push just what changed",
    ftp: "manual, untracked",
    bedrock: "✓ (code only, not content/config)",
    dbSync: "✗ all-or-nothing",
    loopress: "✓",
  },
  {
    label: "Runs on any managed host as-is",
    ftp: "✓",
    bedrock: "depends on docroot support",
    dbSync: "✓",
    loopress: "✓",
  },
];

export function Solution() {
  return (
    <section id="solution" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <h2 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
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

        <div className="mt-14">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Bedrock is a good ally, not something Loopress replaces: it restructures a project for
            teams that can commit to that upfront, and still needs its own deploy tooling.
            Staging/DB-sync tools (WP Staging, Duplicator, All-in-One WP Migration) solve a
            different problem too: a full-site snapshot, not a surgical, reviewable change. Loopress
            takes a third trade: no restructuring, no full-DB overwrite, works on the stock
            WordPress layout your host already runs.
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border/80 bg-card/40">
            <table className="w-full min-w-180 border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/80 text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-3 font-medium"> </th>
                  <th className="px-5 py-3 font-medium">Old-school FTP</th>
                  <th className="px-5 py-3 font-medium">Roots Bedrock</th>
                  <th className="px-5 py-3 font-medium">DB-sync tools</th>
                  <th className="px-5 py-3 font-medium text-accent-cyan-ink">Loopress</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 text-foreground/90">{row.label}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.ftp}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.bedrock}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.dbSync}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{row.loopress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
