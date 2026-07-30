export function TerminalOnboarding() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-card/40 font-mono text-[13px] leading-relaxed backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <span>Terminal</span>
        <span>Under a minute, start to finish</span>
      </div>
      <div className="space-y-2 px-4 py-4 text-left">
        <div>
          <div className="text-muted-foreground">$ npm install -g @loopress/cli</div>
        </div>
        <div>
          <div className="text-muted-foreground">$ lps project config</div>
          <div className="text-foreground/70">→ opens your browser to authorize</div>
          <div className="text-success-ink">✓ "my-site/production" configured</div>
        </div>
        <div>
          <div className="text-muted-foreground">$ lps init</div>
          <div className="text-success-ink">✓ loopress.json created, ready to commit</div>
        </div>
      </div>
    </div>
  );
}
