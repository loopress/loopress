import { createFileRoute, Link } from "@tanstack/react-router";
import licenseText from "@loopress/assets/LICENSE?raw";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/brand-assets")({
  head: () => ({
    meta: [
      { title: "Brand Assets - Loopress" },
      { name: "description", content: "Loopress trademark and brand asset usage policy." },
    ],
  }),
  component: BrandAssetsPage,
});

function BrandAssetsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Brand Assets</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Trademark and usage policy for the Loopress name and logos.
          </p>
        </div>
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-card/40 px-6 py-6 font-mono text-sm leading-relaxed text-foreground/80">
          {licenseText}
        </pre>
        <p className="mt-8 text-sm text-muted-foreground">
          To request permission for uses not listed above, use the{" "}
          <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
            contact form
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}
