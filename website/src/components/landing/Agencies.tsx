import { SectionLabel } from "./Problem";

const POINTS: { title: string; body: string }[] = [
  {
    title: "Onboard a site in minutes",
    body: "git clone, lps push, and a new machine matches the client's setup. No FTP archaeology, no manual DB export to hand around.",
  },
  {
    title: "A git log that means something",
    body: "History on the code and config that actually breaks sites, not buried under thousands of content revisions. You can see who changed what, and when.",
  },
  {
    title: 'The end of "I\'ll just fix it in prod"',
    body: "Local stops being the slow path. Testing a change first becomes the fast option, so it actually happens.",
  },
  {
    title: "Diffs and rollbacks you can trust",
    body: "The scope is structured and stable, so a diff is readable and a rollback does what you expect. Content is never in the blast radius.",
  },
];

export function Agencies() {
  return (
    <section id="agencies" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionLabel>07 · Agencies</SectionLabel>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Built for teams running many client sites.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              If you maintain a dozen WordPress sites you did not all build, the problem is not any
              one of them. It is that none of them are reproducible, and every prod change is a bet.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
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
      </div>
    </section>
  );
}
