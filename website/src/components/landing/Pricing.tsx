import { SectionLabel } from "./Problem";

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>06 · Pricing</SectionLabel>
        <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Free during the beta.
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Pricing will be announced when the product is ready. Until then, everything is free for beta users.
        </p>
      </div>
    </section>
  );
}
