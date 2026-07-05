import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import logoBlack from "@loopress/assets/loopress-logo-black.svg?url";
import logoWhite from "@loopress/assets/loopress-logo-white.svg?url";

export function Nav() {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <img
            src={theme === "dark" ? logoWhite : logoBlack}
            alt="Loopress"
            width="40"
            height="40"
            className="h-10 w-auto"
          />
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Beta
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="/#problem" className="transition-colors hover:text-foreground">
            Problem
          </a>
          <a href="/#solution" className="transition-colors hover:text-foreground">
            Solution
          </a>
          <a href="/#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="/#integrations" className="transition-colors hover:text-foreground">
            Integrations
          </a>
          <a href="/#vision" className="transition-colors hover:text-foreground">
            Vision
          </a>
          <a href="/#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </a>
          <a href="https://docs.loopress.dev" className="transition-colors hover:text-foreground">
            Docs
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <a
            href="https://console.loopress.dev"
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Join the Beta
          </a>
        </div>
      </div>
    </header>
  );
}
