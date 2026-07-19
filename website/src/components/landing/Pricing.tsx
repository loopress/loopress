import { SectionLabel } from "./Problem";

const TIERS = [
  {
    name: "Free",
    price: "Free",
    sub: null,
    description: "The CLI and the WordPress plugin are open source.",
    featured: false,
    cta: "Get Started",
    ctaHref: "https://docs.loopress.dev",
    features: [
      "Unlimited local projects & environments",
      "Official CI testing action",
      "3 cloud projects (3 environments each)",
      "1 shared snippet library",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "Coming soon",
    sub: null,
    description: "For freelancers and small teams shipping to real sites in CI.",
    featured: true,
    cta: "Join the Alpha",
    ctaHref: "https://console.loopress.dev",
    features: [
      "Everything in Free",
      "Up to 30 cloud projects (3 environments each)",
      "Unlimited shared snippet libraries",
      "Premium integrations (ACF Pro, Gravity Forms...)",
      "Priority support",
    ],
  },
  {
    name: "Agency",
    price: "Coming soon",
    sub: null,
    description: "For agencies managing WordPress projects at scale.",
    featured: false,
    cta: "Contact us",
    ctaHref: "/contact?topic=agency",
    features: ["Everything in Pro", "Coming soon"],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>06 · Pricing</SectionLabel>
        <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Free to start. Built to scale.
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          The CLI and plugin are open source. The console will have paid tiers. Pricing to be
          announced.
        </p>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col overflow-hidden rounded-xl border p-6 transition-colors ${
                tier.featured
                  ? "border-accent-cyan/50 bg-card/70 shadow-[0_0_40px_-12px_oklch(0.78_0.13_200/0.25)]"
                  : "border-border/80 bg-card/40 hover:border-border"
              }`}
            >
              {tier.featured && (
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent-cyan/60 to-transparent" />
              )}

              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {tier.name}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-semibold tracking-tight ${tier.featured ? "text-accent-cyan" : "text-foreground"}`}
                  >
                    {tier.price}
                  </span>
                  {tier.sub && (
                    <span className="font-mono text-xs text-muted-foreground">{tier.sub}</span>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{tier.description}</p>
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 font-mono text-success">✓</span>
                    <span
                      className={
                        f.startsWith("Everything") ? "text-muted-foreground" : "text-foreground/90"
                      }
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={tier.ctaHref}
                className={`mt-8 inline-flex h-9 w-full items-center justify-center rounded-md text-sm font-medium transition-colors ${
                  tier.featured
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border border-border bg-background/60 text-foreground hover:bg-card"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
