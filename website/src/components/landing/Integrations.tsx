import { SectionLabel } from "./Problem";

const AVAILABLE = [
  { name: "Code Snippets", desc: "Pull, push, and list snippets via the CLI." },
  { name: "WPCode", desc: "Same CLI commands, targets WPCode instead." },
  { name: "Packagist", desc: "Install any public Composer package from the admin." },
];

const SOON = [
  { name: "WordPress Core", desc: "Options, settings, and roles as code." },
  { name: "ACF", desc: "Field groups as JSON, synced via CLI." },
  { name: "WooCommerce", desc: "Settings and shipping zones as code." },
];

export function Integrations() {
  return (
    <section id="integrations" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>04 · Integrations</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Works with the plugins you already use.
        </h2>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <div>
            <Header status="available">Available</Header>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {AVAILABLE.map((i) => (
                <IntegrationCard key={i.name} status="available" {...i} />
              ))}
            </div>
          </div>
          <div>
            <Header status="soon">In Development</Header>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SOON.map((i) => (
                <IntegrationCard key={i.name} status="soon" {...i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Header({ status, children }: { status: "available" | "soon"; children: React.ReactNode }) {
  const color = status === "available" ? "text-success bg-success/10 border-success/30" : "text-warning bg-warning/10 border-warning/30";
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${color}`}>
        {status === "available" ? "Live" : "Soon"}
      </span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

function IntegrationCard({
  name,
  desc,
  status,
}: {
  name: string;
  desc: string;
  status: "available" | "soon";
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border/80 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background font-mono text-xs text-muted-foreground">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-sm font-medium text-foreground">{name}</div>
        </div>
        {status === "available" ? (
          <span className="h-2 w-2 rounded-full bg-success animate-pulse-dot" />
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">in dev</span>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}