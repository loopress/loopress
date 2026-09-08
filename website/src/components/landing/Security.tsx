import { SectionLabel } from "./Problem";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

const POINTS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Official WordPress auth, nothing proprietary",
    body: "Every command authenticates with a WordPress Application Password, the same mechanism WordPress core has shipped since 5.6. Revoke it from Users → Profile at any time and access stops immediately, no Loopress involvement required.",
  },
  {
    title: "Snippets: trust stays with the plugin you already run",
    body: (
      <>
        For snippets, Loopress touches neither storage nor execution. It pushes to{" "}
        <Code>Code Snippets</Code> or <Code>WPCode</Code>, established plugins with years of
        production use around running PHP from the admin. You inherit their hardening and their
        track record, not a new one.
      </>
    ),
  },
  {
    title: "Hooks and API Routes: native primitives, no runtime of our own",
    body: (
      <>
        Loopress loads and wires each file with its own loader and Composer resolution, then
        execution runs through <Code>add_action</Code>, <Code>add_filter</Code> and{" "}
        <Code>register_rest_route</Code>. The code runs exactly as if you had written it by hand in
        a plugin. The shape is constrained too, one class, one method per hook or verb, so it audits
        better than an arbitrary blob of PHP.
      </>
    ),
  },
  {
    title: "API routes are admin-only by default",
    body: (
      <>
        A route deployed via <Code>lps api</Code> requires the <Code>manage_options</Code>{" "}
        capability unless the file explicitly opts into something else with a{" "}
        <Code>permission()</Code> method. Nothing is public unless you say so.
      </>
    ),
  },
  {
    title: "Reviewed before it runs",
    body: "Every hook, every route, every Composer dependency is a file in your Git repository before it is ever live on WordPress: no plugin you didn't read, no code that skipped a pull request.",
  },
];

export function Security() {
  return (
    <section id="security" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>05 · Security</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Secure by default, not by configuration.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Installing Composer packages without SSH, and wiring hooks and REST routes from Git, are
          exactly the kind of features a senior developer should be suspicious of. Here is what is
          actually enforced, and where the trust actually sits.
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {POINTS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-border/80 bg-card/40 p-6 transition-colors hover:border-border"
            >
              <h3 className="text-base font-medium text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
