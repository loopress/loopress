import pluginPkg from "../../../../wordpress-plugin/package.json";
import { SectionLabel } from "./Problem";

const pluginTag = `wordpress-plugin%40${pluginPkg.version}`;
const pluginDownloadUrl = `https://github.com/loopress/loopress/releases/download/${pluginTag}/loopress-full.zip`;

export function Features() {
  return (
    <section id="features" className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>04 · Features</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          One resource at a time, all in Git.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Each Loopress feature is one kind of resource: a file that describes a desired state, and
          a command that reconciles it with the site.
        </p>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <FeatureCard
            tag="01"
            title="Hooks"
            description={
              <>
                Declare actions and filters as PHP 8 classes with attributes. Loopress loads and
                wires each file onto native <Code>add_action</Code> / <Code>add_filter</Code>: no
                admin paste box, no runtime of its own. The durable home for behavior you want to
                keep.
              </>
            }
          >
            <HooksBlock />
          </FeatureCard>

          <FeatureCard
            tag="02"
            title="Plugin Lockfile"
            description={
              <>
                Declare plugin and theme versions in <Code>loopress.json</Code>, like a{" "}
                <Code>package.json</Code> for WordPress. <Code>lps plugin pull</Code> merges what's
                actually live into your manifest instead of overwriting it, so drift never turns
                into a fight.
              </>
            }
          >
            <PluginsBlock />
          </FeatureCard>

          <FeatureCard
            tag="03"
            title="Composer without SSH"
            description="Search and install any Packagist package from the WordPress admin, no terminal, no SSH. Every install is checked: known CVEs flagged, PHP version mismatches caught before they break anything."
            cta={{ label: "Download Loopress Full", href: pluginDownloadUrl }}
          >
            <ComposerBlock />
          </FeatureCard>

          <FeatureCard
            tag="04"
            title="Apps"
            description={
              <>
                Version a Vue, React or Svelte front-end alongside the rest of the config. Your CI
                runs the build, <Code>lps app push</Code> ships the <Code>dist/</Code> output over
                the REST API, and a shortcode mounts it into any page.
              </>
            }
          >
            <AppBlock />
          </FeatureCard>

          <FeatureCard
            tag="05"
            title="API Routes"
            description="Ship a REST API for your headless front-end as version-controlled PHP files, one class, one method per HTTP verb, wired onto native register_rest_route(). A broken route is skipped and logged instead of taking down the rest of your API."
          >
            <ApiBlock />
          </FeatureCard>

          <FeatureCard
            tag="06"
            title="Official CI configs"
            description={
              <>
                Bootstrap a full, disposable WordPress instance in GitHub Actions or GitLab CI and
                run <Code>lps</Code> against it in one step: not a mock, ready for real Playwright
                e2e tests, with database snapshots between test groups.
              </>
            }
          >
            <CIBlock />
          </FeatureCard>

          <FeatureCard
            tag="07"
            title="Static Pages"
            description={
              <>
                Hand-written <Code>.html</Code> files in <Code>pages/</Code>, pushed as regular
                WordPress pages rendered inside your theme, header and footer included. The file is
                the only source of truth: a Loopress page can't drift in wp-admin.
              </>
            }
          >
            <PagesBlock />
          </FeatureCard>

          <FeatureCard
            tag="08"
            title="Rollback"
            description={
              <>
                Every push snapshots what it's about to overwrite. <Code>lps hook rollback</Code>{" "}
                (or <Code>api</Code>, <Code>acf</Code>, <Code>seo</Code>, <Code>menu</Code>...) puts
                it back, and asks first if the site changed since that snapshot was taken.
              </>
            }
          >
            <RollbackBlock />
          </FeatureCard>

          <FeatureCard
            tag="09"
            title="MCP Server"
            description={
              <>
                Let Claude Code or any MCP client pull, diff and push your site through{" "}
                <Code>lps</Code>. Every mutating call previews first and is refused if the site
                changed between the preview and the confirmation.
              </>
            }
          >
            <McpBlock />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  badge,
  description,
  cta,
  children,
}: {
  tag: string;
  title: string;
  badge?: string;
  description: React.ReactNode;
  cta?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-card/40 p-6 transition-colors hover:border-border">
      <div className="font-mono text-[10px] tracking-widest text-accent-cyan-ink">F.{tag}</div>
      <div className="mt-2 flex items-center gap-2.5">
        <h3 className="text-xl font-medium text-foreground">{title}</h3>
        {badge && (
          <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-warning-ink">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">{description}</p>
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

function HooksBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        hooks/PriceFormatter.php
      </div>
      <pre className="px-3 py-3">
        {`  use Loopress\\Hook\\On;

  class PriceFormatter
  {
      #[On('woocommerce_get_price_html')]
      public function suffix(string $html): string
      {
          return $html . ' incl. VAT';
      }
  }`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps hook push</Line>
        <Line c="muted"># wired onto add_filter('woocommerce_get_price_html')</Line>
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

function AppBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        apps/search/
      </div>
      <pre className="px-3 py-3">
        {`  loopress.app.json
  dist/            # your build output
    index.html
    assets/index-9a597e0d.js`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps app push search</Line>
        <Line c="success">✓ Uploaded 4 changed files</Line>
        <Line c="muted">[loopress_app name=&quot;search&quot;]</Line>
      </div>
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
  - run: lps push`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="success">✓ WordPress + MySQL started</Line>
        <Line c="success">✓ Reconciled: 8 resources applied</Line>
      </div>
    </div>
  );
}

function PagesBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        pages/legal-notice.html
      </div>
      <pre className="px-3 py-3">
        {`  <!--
  title: Legal notice
  status: publish
  -->
  <section class="legal">
    <h1>Legal notice</h1>
  </section>`}
      </pre>
      <div className="border-t border-border/80 px-3 py-2 text-[10px] text-muted-foreground">
        <Line c="muted">$ lps page push</Line>
        <Line c="success">✓ Published: /legal-notice/</Line>
      </div>
    </div>
  );
}

function RollbackBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        Terminal
      </div>
      <pre className="px-3 py-3">
        <Line c="muted">$ lps hook rollback --list</Line>
        <Line c="muted"> 2026-09-24 10:42 production (latest)</Line>
        <Line c="muted"> 2026-09-23 17:05 production</Line>
        <Line c="muted">$ lps hook rollback</Line>
        <Line c="success">Rolled back hooks to the snapshot from 10:42.</Line>
      </pre>
    </div>
  );
}

function McpBlock() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/60 font-mono text-[12px] leading-relaxed">
      <div className="border-b border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground">
        Claude Code
      </div>
      <pre className="px-3 py-3">
        <Line c="muted">$ claude mcp add loopress -- lps-mcp</Line>
        <Line c="muted">&gt; add a VAT suffix to WooCommerce prices on staging</Line>
        <Line c="muted"> hook_push (preview): +1 hooks/PriceFormatter.php</Line>
        <Line c="success">✓ Confirmed and pushed to staging</Line>
      </pre>
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

function Line({ c, children }: { c: "muted" | "success"; children: React.ReactNode }) {
  return (
    <div className={c === "success" ? "text-success-ink" : "text-muted-foreground"}>{children}</div>
  );
}
