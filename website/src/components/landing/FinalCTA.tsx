import { useState } from "react";
import { subscribe } from "@/lib/subscribe";

export function FinalCTA() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === "loading") return;

    setStatus("loading");
    try {
      await subscribe({ data: { email } });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section id="beta" className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 grid-bg radial-fade opacity-50" aria-hidden />
      <div className="absolute left-1/2 top-1/2 z-0 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.65_0.2_280/0.18),transparent)]" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-6 py-28 text-center md:py-36">
        <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
          <span className="text-gradient">Built in the open. Shaped by the community.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          The CLI and the plugin are open source. Leave your email to follow along and get notified when things move.
        </p>

        {status === "success" ? (
          <p className="mt-9 font-mono text-sm text-success">
            ✓ You're on the list. We'll reach out as cohorts open up.
          </p>
        ) : (
          <form
            className="mx-auto mt-9 flex max-w-md flex-col gap-2 sm:flex-row"
            onSubmit={handleSubmit}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.dev"
              disabled={status === "loading"}
              className="h-11 flex-1 rounded-md border border-border bg-card/60 px-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "loading" ? "Sending…" : "Join the Beta →"}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 font-mono text-xs text-destructive">
            Something went wrong. Please try again.
          </p>
        )}

        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          No spam. No marketing. Just product updates from the team.
        </p>
      </div>
    </section>
  );
}
