# Design — Loopress marketing site

A locked design system for `loopress/website`. Every page redesign reads this file
before emitting code. Do not regenerate per page, extend or amend this file when
the system needs to grow.

## Genre
modern-minimal

## Macrostructure family
- Marketing pages (`index`): Workbench — terminal/diff/code content is the page's
  real evidence, not decoration standing in for it. Hero is left-biased, not
  centred-everything. No section eyebrows (none of the sections are ordinal).
- Content pages (`faq`, `privacy`, `terms`, `brand-assets`, `contact`): Long
  Document — single column, restrained, no eyebrows except a page's own one-line
  kicker above its own `h1` (never repeated per-section).

## Theme
Kept the project's existing OKLCH tokens and shadcn-style names rather than
inventing new ones. Values below are the light theme; dark theme is unchanged
from what already shipped (verified good contrast there).

- `--background`   oklch(0.982 0.004 250)
- `--card`          oklch(0.972 0.005 252)
- `--foreground`    oklch(0.12 0.04 265)
- `--muted-foreground` oklch(0.42 0.04 258)
- `--border`        oklch(0.87 0.014 256)
- `--accent-cyan`   oklch(0.78 0.13 200)   — fills, dots, large surfaces only
- `--accent-cyan-ink` oklch(0.52 0.13 200) — text on light surfaces (4.64:1 verified)
- `--success-ink`   oklch(0.53 0.17 150)   — text on light surfaces (4.54:1 verified)
- `--warning-ink`   oklch(0.56 0.16 70)    — text on light surfaces (4.55:1 verified)
- `--destructive-ink` oklch(0.58 0.245 27.325) — text on light surfaces (4.53:1 verified)
- `--ring`          oklch(0.50 0.13 200)   — focus ring, 5.0:1 vs background verified

## Typography
- Display: Inter, weight 600, style normal
- Body: Inter, weight 400
- Mono (labels/code): JetBrains Mono, weight 400-600
- This is a genuine two-family pairing (sans + mono), not the Inter-everywhere
  tell — mono carries a distinct role (code, labels, terminal output).

## Spacing
Existing Tailwind v4 default scale, used via utility classes. No raw pixel values.

## Motion
- CSS only, no motion library installed.
- Existing primitives kept: `animate-ping` badge dot, `animate-pulse-dot` status
  dot. Both transform/opacity only.
- Reduced-motion: browser/Tailwind defaults apply; primitives are subtle enough
  to not need a bespoke override.

## Microinteractions stance
- Silent success on the newsletter form (no celebratory toast) — already correct.
- Focus rings appear instantly via a global `:focus-visible` rule, never animated.

## CTA voice
- Primary: filled `bg-primary`, rounded-md, `h-10`/`h-11` depending on context.
- Secondary: outline `border-border`, same shape.
- Kept as-is — not flagged, no reason to invent a new voice.

## Per-page allowances
- Marketing page (`index`) may use the terminal/diff mockups as its content
  device (typographic frame only, no drawn window chrome).
- Content pages: typography only, no code mockups, no enrichment.

## What pages MUST share
- The `--accent-cyan` / `--accent-cyan-ink` identity and its footprint.
- Inter + JetBrains Mono.
- The CTA voice (button shape, radius, padding rhythm).
- Nav: N1b (wordmark left, centred link cluster, theme toggle + CTA right).
- Footer: Ft2 (single inline line, no column grid).
- No section eyebrows beyond a single page-level kicker.

## What pages MAY differ on
- Macrostructure within the family (index's Workbench vs. the content pages'
  Long Document) — both still use the system's type, colour, and CTA voice.

## Fixed from the pre-redesign audit
- `--accent-cyan`, `--success`, `--warning` used directly as light-mode text
  colour failed WCAG (1.76-2.14:1). Replaced with the `-ink` variants above at
  every text usage; the bright values stay for fills/dots only.
- `.text-gradient` (background-clip:text headline) removed — solid ink instead.
- Fake terminal traffic-light dots removed from `TerminalOnboarding` and
  `WorkflowDiagram` — real content, no drawn chrome.
- `SectionLabel` (the `01 · The Problem` eyebrow) removed from all seven
  sections it appeared on.
- Hero's badge/headline/lede/CTA row no longer share one centred axis.
- A global `:focus-visible` rule now covers every interactive element.

## Exports

### tokens.css
```css
:root {
  --color-background: oklch(0.982 0.004 250);
  --color-card: oklch(0.972 0.005 252);
  --color-foreground: oklch(0.12 0.04 265);
  --color-muted-foreground: oklch(0.42 0.04 258);
  --color-border: oklch(0.87 0.014 256);
  --color-accent-cyan: oklch(0.78 0.13 200);
  --color-accent-cyan-ink: oklch(0.52 0.13 200);
  --color-success-ink: oklch(0.53 0.17 150);
  --color-warning-ink: oklch(0.56 0.16 70);
  --color-destructive-ink: oklch(0.58 0.245 27.325);
  --color-ring: oklch(0.50 0.13 200);

  --font-display: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --radius: 0.625rem;
}
```

The full token set (including dark theme, chart colours, sidebar colours) lives
in `src/styles.css` — this block is the subset that changed in the redesign.
