export function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
        <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          <span className="rounded border border-border bg-card/60 px-1.5 py-0.5 text-foreground">wdx</span>
          <span>v0.4.0-beta · made for developers who ship WordPress</span>
        </div>
        <div className="flex flex-wrap gap-5 font-mono text-xs text-muted-foreground">
          <a href="https://docs.wordpressdx.dev" className="hover:text-foreground">Docs</a>
          <a href="https://github.com/wordpress-dx" className="hover:text-foreground">GitHub</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/brand-assets" className="hover:text-foreground">Brand</a>
          <a href="/contact" className="hover:text-foreground">Contact</a>
        </div>
      </div>
    </footer>
  );
}