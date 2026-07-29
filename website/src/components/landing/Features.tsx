import pluginPkg from "../../../../wordpress-plugin/package.json";

const pluginTag = `wordpress-plugin%40${pluginPkg.version}`;
const pluginDownloadUrl = `https://github.com/loopress/loopress/releases/download/${pluginTag}/loopress-full.zip`;

export function Features() {
  return (
    <section id="features" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <h2 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Built for developers who ship WordPress.
        </h2>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <FeatureCard
            tag="01"
            title="Snippets in Git"
            pain="Snippets edited live in the admin panel. No history, no rollback, no idea who changed what."
            solution="Pull snippets as .php files, edit them locally, and push back when you're done."
            impact="Every change is a commit: reviewable, diffable, revertable."
            bullets={[
              "Migrate snippets between WPCode and Code Snippets from the WordPress admin, one click at a time",
            ]}
          >
            <SnippetsBlock />
          </FeatureCard>

          <FeatureCard
            tag="02"
            title="Plugin Lockfile"
            pain="A client installs a plugin straight into production, or two developers deploy different plugin sets to the same site. Now nobody's sure what's actually running where."
            solution="Declare plugin versions in loopress.json like a package.json. Push to any environment for an exact, reproducible install."
            impact="lps plugin pull merges what's actually on the site into your manifest instead of overwriting it, so drift never turns into a fight."
          >
            <PluginsBlock />
          </FeatureCard>

          <FeatureCard
            tag="03"
            title="Composer without SSH"
            pain="Installing a PHP dependency means SSH, a terminal on the server, and hoping composer install doesn't break the site."
            solution="Search and install any Packagist package from the WordPress admin panel, no terminal."
            impact="Every install is checked before it ships."
            bullets={[
              "Security audit flags known CVEs in your Composer dependencies",
              "Platform diagnostics catch PHP version mismatches before they break an install",
            ]}
            cta={{ label: "Download Loopress Full", href: pluginDownloadUrl }}
          >
            <ComposerBlock />
          </FeatureCard>

          <FeatureCard
            tag="04"
            title="Official CI configs"
            pain="Standing up a real WordPress instance in CI usually means hand-rolling Docker, MySQL, and a WP-CLI bootstrap script, for every project."
            solution="Bootstrap a full WordPress environment in GitHub Actions or GitLab CI, and run lps against it in a single step."
            impact="A real, disposable WordPress instance, not a mock, ready for actual Playwright e2e tests."
            bullets={[
              "Snapshot and restore the database between test groups without respawning the stack",
            ]}
          >
            <CIBlock />
          </FeatureCard>

          <FeatureCard
            tag="05"
            title="Custom API Routes"
            pain="Every project eventually needs a REST endpoint, a webhook receiver, a headless data feed. Building one usually means a mini-plugin nobody wants to maintain."
            solution="Ship a REST API for your headless frontend (Next.js, Astro, anything) as version-controlled PHP files. One class, one method per HTTP verb."
            impact="A package installed via lps composer require is usable inside a route file immediately: the autoloader is already there, no require_once."
            bullets={[
              "Every deployed route shows up in the plugin's API tab, right after lps api push",
              "A broken route file is skipped and logged, it never takes down the rest of your REST API",
            ]}
          >
            <ApiBlock />
          </FeatureCard>

          <FeatureCard
            tag="06"
            title="Pages in Git"
            pain="Reproducing a page's content across environments usually means a database dump or a migration script."
            solution="Pull a WordPress page's content as a real, editable .html file. Edit it, commit it, push it back to redeploy."
            impact="No database dump, no migration, the same Git loop as any other code change."
            bullets={[
              "Talks to WordPress's own REST API directly, no Loopress plugin required",
              "Metadata (status, parent, template) kept in a separate JSON sidecar, never mixed into the content you edit",
            ]}
          >
            <PageBlock />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  pain,
  solution,
  impact,
  bullets,
  cta,
  children,
}: {
  tag: string;
  title: string;
  pain: string;
  solution: string;
  impact: string;
  bullets?: string[];
  cta?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-card/40 p-6 transition-colors hover:border-border">
      <div className="font-mono text-[10px] tracking-widest text-accent-cyan-ink">F.{tag}</div>
      <h3 className="mt-2 text-xl font-medium text-foreground">{title}</h3>
      <p className="mt-3 max-w-md text-sm text-destructive-ink">{pain}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{solution}</p>
      <p className="mt-2 max-w-md text-sm font-medium text-accent-cyan-ink">→ {impact}</p>
      {bullets && (
        <ul className="mt-3 max-w-md space-y-1.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground/90">
              <span className="mt-0.5 font-mono text-xs text-success-ink">✓</span>
              {b}
            </li>
          ))}
        </ul>
      )}
      {cta && (
        <a
          href={cta.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-cyan-ink transition-opacity hover:opacity-80"
        >
          {cta.label}
          <span>↓</span>
        </a>
      )}
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
        <Line c="muted">$ lps snippet push</Line>
        <Line c="success">✓ Updated: disable-emojis</Line>
      </div>
    </div>
  );
}

function PluginsBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        loopress.json · plugins
      </div>
      <pre className="px-3 py-3">
        {`  "plugins": {
    "woocommerce": "9.4.2",
    "contact-form-7": "6.0.5",
    "fluent-crm": "3.1.6"
  }`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps plugin push</Line>
        <Line c="success">✓ Installed: contact-form-7 6.0.5</Line>
        <Line c="success">✓ Already up to date: woocommerce, fluent-crm</Line>
      </div>
    </div>
  );
}

function ComposerBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        WordPress Admin · Loopress · Dependencies
      </div>
      <pre className="px-3 py-3">
        <Line c="muted">Search: tcpdf</Line>
        <Line c="success">✓ tecnickcom/tcpdf found on Packagist</Line>
        <Line c="muted">&gt; Install</Line>
        <Line c="success">✓ Installing tecnickcom/tcpdf ^6.7</Line>
        <Line c="success">✓ Autoloader updated in wp-content/loopress/</Line>
      </pre>
    </div>
  );
}

function CIBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="flex items-center justify-between border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>.github/workflows/loopress.yml</span>
      </div>
      <pre className="px-3 py-3">
        {`steps:
  - uses: actions/checkout@v4
  - uses: loopress/setup-ci@main
  - run: lps snippet push`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="success">✓ WordPress + MySQL started</Line>
        <Line c="success">✓ Updated: 3 snippets synced</Line>
      </div>
    </div>
  );
}

function ApiBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        api/webhook-handler.php
      </div>
      <pre className="px-3 py-3">
        {`  class WebhookHandler
  {
      public function post(): array
      {
          return ['received' => true];
      }
  }`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps api push</Line>
        <Line c="success">✓ Deployed: /loopress-api/v1/webhook-handler</Line>
      </div>
    </div>
  );
}

function PageBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="flex items-center justify-between border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>pages/9-about.html</span>
      </div>
      <pre className="px-3 py-3">
        {`  <!-- wp:paragraph -->
  <p>We build tools for developers
  who ship WordPress.</p>
  <!-- /wp:paragraph -->`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps page push</Line>
        <Line c="success">✓ Pushed: About</Line>
      </div>
    </div>
  );
}

function Line({ c, children }: { c: "muted" | "success"; children: React.ReactNode }) {
  return (
    <div className={c === "success" ? "text-success-ink" : "text-muted-foreground"}>{children}</div>
  );
}
