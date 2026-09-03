import { SectionLabel } from "./Problem";

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>08 · Pricing</SectionLabel>
        <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Free to start. Built to scale.
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          The CLI and the WordPress plugin (Full) are free and open source, always. The console
          is free for now. Down the line, paid tiers kick in once you pass a certain number of
          projects, not before.
        </p>
      </div>
    </section>
  );
}
