// Data for the /vs pages: the overview matrix and one page per alternative. Competitor facts
// are kept to what is public and stable; every Loopress command was checked in cli/ (--env is a
// base flag on every command).

export type Alternative = {
  slug: string;
  name: string;
  kind: string;
  heading: string;
  lede: string;
  rows: [topic: string, them: string, us: string][];
  task?: { title: string; them: string[]; us: string };
  together?: string;
  theirs: string;
  ours: string;
  // Overview matrix cells, same order as `criteria` and `gapCriteria`.
  matrix: string[];
  gaps: string[];
};

export const criteria = [
  "Leaves the site layout as is",
  "ACF field groups in Git",
  "Menus, SEO, options in Git",
  "Diff before you ship",
  "Content stays untouched",
  "No SSH",
];

export const loopressMatrix = ["yes", "yes", "yes", "yes, per file", "always", "yes"];

// What Loopress deliberately doesn't do, so the overview isn't a scoreboard. Checked in cli/: no
// core version management, and the only snapshots are the per-push ones used by rollback.
export const gapCriteria = [
  "Full site backups",
  "Clone or move a whole site",
  "Move content, posts and media",
  "WordPress core version in code",
];

export const loopressGaps = ["no", "no", "no", "no"];

export const alternatives: Alternative[] = [
  {
    slug: "acf-local-json",
    name: "ACF Local JSON",
    kind: "the built-in option",
    heading: "Loopress vs ACF Local JSON.",
    lede: "ACF can already save field groups as JSON in your theme. If field groups are all you need in Git, that may be enough. Loopress starts where it stops.",
    rows: [
      ["What's in Git", "ACF field groups, post types, taxonomies, options pages", "The same, plus SEO, menus, options, theme styles, and code with Full"],
      ["Getting it live", "Deploy the theme, then click Sync in each site's admin", "lps acf push --env production"],
      ["Changes made in wp-admin", "Written to the JSON file of the site they were made on", "lps acf pull brings them back from any environment"],
      ["Undo", "Revert the commit and sync again", "lps acf rollback, to the snapshot taken before the push"],
    ],
    task: {
      title: "Ship a field group change to production",
      them: ["Commit acf-json/ in the theme", "Deploy the theme to production", "Open Field Groups in wp-admin", "Click Sync on the changed group"],
      us: `$ lps acf diff --env production
$ lps acf push --env production`,
    },
    theirs: "ACF is the only configuration you care about, you already deploy the theme from Git, and a manual sync step on each site doesn't bother you.",
    ours: "Field groups are one piece among menus, SEO and options, or you want to see the diff and ship from the terminal or CI instead of clicking Sync.",
    matrix: ["yes", "yes", "no", "in the theme's Git history", "yes", "yes"],
    gaps: ["no", "no", "no", "no"],
  },
  {
    slug: "wp-staging",
    name: "WP Staging and Duplicator",
    kind: "staging and migration plugins",
    heading: "Loopress vs WP Staging and Duplicator.",
    lede: "Staging and migration plugins copy a whole site, database included. Loopress moves only the configuration and code you changed, and never the content.",
    rows: [
      ["Unit of change", "A snapshot of the site, files and database", "One file: a field group, a menu, a hook"],
      ["Before pushing", "No diff against the last copy", "lps diff shows exactly what will change"],
      ["Content", "Copied along, so live edits can be overwritten", "Never read into the repo, never written by a push"],
      ["History", "Backups, by date", "Git history, with a PR per change"],
      ["Undo", "Restore a backup", "Roll back one resource to its pre-push snapshot"],
    ],
    task: {
      title: "Ship a new ACF field while orders keep coming in",
      them: ["Clone production to staging", "Add the field on staging", "Push staging back, choosing which tables to include", "Hope no order or comment landed in those tables since the clone"],
      us: `$ lps acf diff --env production
$ lps acf push --env production`,
    },
    together: "Keep them for what Loopress doesn't do: full backups, cloning a site, moving to a new host. Use Loopress for the changes you make every week.",
    theirs: "You need to clone a whole site, move it to a new host, or keep full backups. Loopress doesn't do any of that.",
    ours: "You change the same site again and again, and want to ship a field group without touching the orders that came in since the last copy.",
    matrix: ["yes", "no", "no", "no", "only if you exclude tables", "yes"],
    gaps: ["yes", "yes", "yes", "no"],
  },
  {
    slug: "wp-migrate",
    name: "WP Migrate",
    kind: "database sync",
    heading: "Loopress vs WP Migrate.",
    lede: "WP Migrate pushes and pulls databases between environments, with find and replace on URLs. Loopress moves configuration as files, one resource at a time.",
    rows: [
      ["Unit of change", "Database tables", "Files: one per field group, menu, option, hook"],
      ["Before pushing", "Pick tables, no row-level diff", "lps diff, per file"],
      ["Content", "Travels with the tables you pick", "Never moves"],
      ["History", "None of its own", "Git, with a PR per change"],
    ],
    task: {
      title: "Move new SEO redirects from staging to production",
      them: ["Find which tables the SEO plugin stores redirects in", "Push those tables to production", "Overwrite any redirect added on production meanwhile"],
      us: `$ lps seo pull --env staging
$ git commit -am "feat: new redirects"
$ lps seo push --env production`,
    },
    together: "Pull production content down to your local site with WP Migrate, ship configuration and code up with Loopress. Content goes down, changes go up.",
    theirs: "You need real content locally, or you're moving a whole database between environments.",
    ours: "What you're moving is configuration, and you want a reviewable diff instead of a table overwrite.",
    matrix: ["yes", "no", "no", "no", "only if you exclude tables", "yes"],
    gaps: ["database export", "yes", "yes", "no"],
  },
  {
    slug: "bedrock",
    name: "Roots Bedrock",
    kind: "a project structure",
    heading: "Loopress vs Bedrock.",
    lede: "Bedrock restructures a WordPress project around Composer. Loopress leaves the site as it is and puts its configuration and code in Git.",
    rows: [
      ["Project layout", "Its own: core in web/wp, code in web/app, settings in .env", "The stock wp-content layout your host already runs"],
      ["Plugins", "Composer, in your repo", "A lockfile in loopress.json, or your composer.json"],
      ["Deploy", "Usually Trellis, which needs SSH and control of the server", "lps push over the REST API, no SSH"],
      ["Configuration in the database (menus, SEO, options)", "Not covered", "Pulled as files, pushed back, diffed"],
      ["Existing sites", "A migration to the new layout", "Connect and pull, nothing to move"],
    ],
    task: {
      title: "Ship a menu change from staging to production",
      them: ["Nothing in the repo describes the menu", "Redo the change by hand in production's wp-admin"],
      us: `$ lps menu pull --env staging
$ git commit -am "feat: footer menu"
$ lps menu push --env production`,
    },
    theirs: "You start a site from scratch, own the server, and want Composer to manage everything including WordPress core.",
    ours: "You look after sites that already exist, on hosts you don't control, and the risky changes are the ones made in wp-admin.",
    matrix: ["no", "no", "no", "code only", "yes", "Trellis needs it"],
    gaps: ["no", "no", "no", "yes, via Composer"],
  },
  {
    slug: "versionpress",
    name: "VersionPress",
    kind: "archived",
    heading: "Loopress vs VersionPress.",
    lede: "VersionPress tried to put the whole database in Git, content included. Loopress takes the opposite constraint.",
    rows: [
      ["Scope", "Database and content", "Configuration and code only"],
      ["Status", "Archived, never left developer preview", "Alpha, actively developed"],
      ["Merging", "Serialized database rows", "Plain files: JSON and PHP classes"],
      ["Content", "Versioned", "Stays in WordPress, where editors work"],
    ],
    theirs: "There's no case left: the project is archived.",
    ours: "You wanted what VersionPress promised for the parts of a site that a developer actually changes.",
    matrix: ["yes", "yes", "yes", "yes", "no, versioned too", "yes"],
    gaps: ["no", "no", "versioned in Git", "no"],
  },
];
