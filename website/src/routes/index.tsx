import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { Solution } from "@/components/landing/Solution";
import { Features } from "@/components/landing/Features";
import { Integrations } from "@/components/landing/Integrations";
import { Vision } from "@/components/landing/Vision";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loopress - Make WordPress reproducible" },
      { name: "description", content: "Modern development workflows for WordPress. Configuration as code, version control, reproducible environments. Join the beta." },
      { property: "og:title", content: "Loopress - Make WordPress reproducible" },
      { property: "og:description", content: "Loopress brings Git, Composer and reproducible environments to WordPress." },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Loopress",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          description: "Modern development workflows for WordPress. Configuration as code, version control, reproducible environments.",
          url: "https://loopress.dev",
          author: { "@id": "https://loopress.dev/#organization" },
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            description: "Free during beta",
          },
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Features />
        <Integrations />
        <Vision />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
