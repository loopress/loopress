import { SectionLabel } from "./Problem";

export function Vision() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionLabel>05 · Vision</SectionLabel>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              The future of WordPress development.
            </h2>
          </div>
          <div className="space-y-5 text-lg leading-relaxed text-muted-foreground lg:col-span-6 lg:col-start-7">
            <p>
              We believe WordPress projects should be as reproducible as modern applications.
            </p>
            <p>
              Developers should not have to choose between WordPress flexibility and modern
              engineering practices.
            </p>
            <p className="text-foreground">
              Loopress brings both worlds together.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}