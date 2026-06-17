import { SectionLabel } from "./Problem";

export function Features() {
  return (
    <section id="features" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>03 · Features</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Built for developers who ship WordPress.
        </h2>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <FeatureCard
            tag="01"
            title="Snippets in Git"
            body="Pull snippets as .php files, edit them locally, and push back when you're done. Git history, diffs, and rollbacks included."
          >
            <SnippetsBlock />
          </FeatureCard>

          <FeatureCard
            tag="02"
            title="Composer without SSH"
            body="Search and install any Packagist package from the WordPress admin panel, without opening a terminal."
          >
            <ComposerBlock />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  body,
  children,
}: {
  tag: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-card/40 p-6 transition-colors hover:border-border">
      <div className="font-mono text-[10px] tracking-widest text-accent-cyan">F.{tag}</div>
      <h3 className="mt-2 text-xl font-medium text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function SnippetsBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="flex items-center justify-between border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>snippets/disable-emojis.php</span>
        <span>+ 3 / − 1</span>
      </div>
      <pre className="px-3 py-3">
{`  <?php
- // remove_action('wp_head', ...);
+ remove_action('wp_head', 'print_emoji_detection_script', 7);
+ remove_action('wp_print_styles', 'print_emoji_styles');
+ remove_filter('the_content_feed', 'wp_staticize_emoji');`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps snippets push</Line>
        <Line c="success">✓ Updated: disable-emojis</Line>
      </div>
    </div>
  );
}

function ComposerBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        WordPress Admin · Loopress · Dependency Management
      </div>
      <pre className="px-3 py-3">
        <Line c="muted">Search: tcpdf</Line>
        <Line c="success">✓ tecnickcom/tcpdf found on Packagist</Line>
        <Line c="muted">&gt; Install</Line>
        <Line c="success">✓ Installing tecnickcom/tcpdf ^6.7</Line>
        <Line c="success">✓ Autoloader updated in wp-content/lps/</Line>
      </pre>
    </div>
  );
}

function Line({ c, children }: { c: "muted" | "success"; children: React.ReactNode }) {
  return <div className={c === "success" ? "text-success" : "text-muted-foreground"}>{children}</div>;
}