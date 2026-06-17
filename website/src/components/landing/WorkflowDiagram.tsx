type Node = {
  label: string;
  sub: string;
  icon?: string;
  logo?: string;
  mono?: boolean;
};

const NODES: Node[] = [
  { label: "WordPress Admin", sub: "Source of truth", logo: "/logo-wordpress.svg" },
  { label: "lps pull", sub: "Serialize config", icon: "↓", mono: true },
  { label: "Git", sub: "Commit & review", logo: "/logo-git.svg" },
  { label: "Pull Request", sub: "Diff & approve", icon: "⤴" },
  { label: "lps push", sub: "Apply to env", icon: "↑", mono: true },
];

export function WorkflowDiagram() {
  return (
    <div className="relative rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur md:p-8">
      <div className="mb-5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          {/* <span className="ml-3">lps · workflow</span> */}
        </div>
        {/* <span className="hidden sm:inline">reproducible.diff</span> */}
      </div>

      <div className="relative grid grid-cols-2 gap-y-6 sm:grid-cols-5 sm:gap-y-0">
        {NODES.map((n, i) => (
          <div key={n.label} className="relative flex flex-col items-center text-center">
            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-background text-lg shadow-[0_0_0_4px_var(--background)]">
              {n.logo ? (
                <img src={n.logo} alt={n.label} className="h-7 w-7 object-contain" />
              ) : (
                <span className={n.mono ? "font-mono text-accent-cyan" : ""}>{n.icon}</span>
              )}
            </div>
            <div className="mt-3 text-xs font-medium text-foreground">{n.label}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{n.sub}</div>
            {i < NODES.length - 1 && (
              <svg
                className="absolute top-7 left-[calc(50%+1.75rem)] hidden h-px text-border sm:block"
                style={{ width: "calc(100% - 3.5rem)" }}
                viewBox="0 0 100 1"
                preserveAspectRatio="none"
                aria-hidden
              >
                <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
              </svg>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-background/50 p-4 font-mono text-[12px] md:grid-cols-2">
        <div>
          <div className="text-muted-foreground">$ lps pull</div>
          <div className="text-foreground">
            <span className="text-success">+</span> config/acf.yaml
          </div>
          <div className="text-foreground">
            <span className="text-success">+</span> config/snippets.yaml
          </div>
          <div className="text-foreground">
            <span className="text-warning">~</span> config/options.yaml
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">$ git diff --stat</div>
          <div className="text-foreground/80">3 files changed, 47 insertions(+), 8 deletions(-)</div>
          <div className="mt-1 text-muted-foreground">$ lps push --env=staging</div>
          <div className="text-success">✓ applied · environment reproducible</div>
        </div>
      </div>
    </div>
  );
}