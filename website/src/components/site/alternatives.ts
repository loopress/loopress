// Data for the /vs pages: the overview matrix and one page per alternative. Competitor facts
// are kept to what is public and stable; every Loopress command was checked in cli/ (--env is a
// base flag on every command).

export type Alternative = {
  slug: string;
  name: string;
  kind: string;
  heading: string;
  // <title> of the page, leads with the query people type.
  seoTitle: string;
  lede: string;
  // Paragraphs between the lede and the table: who reads this page, and the one difference.
  intro: string[];
  // Each row compares the same topic: the first four are what it versions, what it moves, how it
  // deploys and whether content is touched, on every page.
  rows: [topic: string, them: string, us: string][];
  task?: { title: string; them: string[]; us: string };
  together?: string;
  theirs: string;
  ours: string;
  // Overview matrix cells, same order as `criteria` and `gapCriteria`.
  matrix: string[];
  gaps: string[];
  // Rendered on the page and emitted as its FAQPage, from the same array.
  faq: { q: string; a: string }[];
  // The docs page and the cookbook recipe that show the Loopress side.
  docs: [label: string, href: string][];
  recipe: [label: string, href: string];
};

export const criteria = [
  "Leaves the site layout as is",
  "ACF field groups in Git",
  "Menus and options in Git",
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

const noGaps = ["no", "no", "no", "no"];
export const loopressGaps = noGaps;

// Shared by the alternatives that copy database tables (WP Staging, WP Migrate).
const tableCopyMatrix = ["yes", "no", "no", "no", "only if you exclude tables", "yes"];

const acfShip = `$ lps acf diff --env production
$ lps acf push --env production`;

// Bring a resource from staging into the repo, then ship it to production.
const stagingToProduction = (resource: string, message: string) => `$ lps ${resource} pull --env staging
$ git commit -am "${message}"
$ lps ${resource} push --env production`;

const docs = "https://docs.loopress.dev";

export const alternatives: Alternative[] = [
  {
    slug: "acf-local-json",
    name: "ACF Local JSON",
    kind: "the built-in option",
    heading: "An ACF Local JSON alternative for the rest of your config.",
    seoTitle: "ACF Local JSON Alternative: Loopress vs Local JSON - Loopress",
    lede: "ACF can already save field groups as JSON in your theme. If field groups are all you need in Git, that may be enough. Loopress starts where it stops.",
    intro: [
      "If you searched for an ACF Local JSON alternative, you probably already keep an acf-json/ folder in your theme and still ship changes by running wp acf json sync, or clicking Sync, on every site. Local JSON is a good feature: it gives field groups a file, and a file can live in Git. With ACF 6.8 and later, WP-CLI can also sync those files into each site's database. What it doesn't give you is a way to compare a site with your files without a shell on that server, or a way to ship the rest of the configuration your fields depend on.",
      "Loopress keeps ACF configuration as JSON files too, in your project rather than your theme, and pushes them to a site over the REST API. The same workflow covers menus, the options you choose to track, post types, roles and theme styles, so a field group and the menu that links to its pages ship together, from the terminal or from CI.",
    ],
    rows: [
      ["What it versions", "ACF field groups, post types, taxonomies, options pages", "The same, plus menus, tracked options, roles, theme styles, and code with Full"],
      ["What it moves", "Nothing by itself: the JSON travels with your theme", "The files you changed, one resource at a time"],
      ["How it deploys", "Deploy the theme, then run wp acf json sync on each site (ACF 6.8+, WP-CLI on the server). Older ACF, or no shell: click Sync in each site's admin", "lps acf push --env production, over the REST API"],
      ["Content touched", "No", "No: posts, orders and users are never pushed"],
      ["Changes made in wp-admin", "Written to the JSON file of the site they were made on", "lps acf pull brings them back from any environment"],
      ["Before shipping", "wp acf json status lists pending items on the install it runs on, usually over SSH. It doesn't compare two environments", "lps acf diff against any environment, or two environments against each other, with no SSH"],
      ["Undo", "Revert the commit and sync again", "lps acf rollback, to the snapshot taken before the push"],
    ],
    task: {
      title: "Ship a field group change to production",
      them: ["Commit acf-json/ in the theme", "Deploy the theme to production", "Run wp acf json status, then wp acf json sync on each site (older ACF: click Sync in wp-admin)"],
      us: acfShip,
    },
    theirs: "ACF is the only configuration you care about, you already deploy the theme from Git, and WP-CLI is available on every server, so wp acf json sync in your deploy script is enough.",
    ours: "Field groups are one piece among menus and options, or you want to diff your files against any environment, or two environments against each other, and ship from the terminal or CI without SSH access to each server.",
    matrix: ["yes", "yes", "no", "in the theme's Git history", "yes", "yes"],
    gaps: noGaps,
    faq: [
      {
        q: "Does Loopress replace ACF?",
        a: "No. ACF stays installed and keeps doing the editing: Loopress only reads and writes its configuration. It needs ACF PRO or the free Secure Custom Fields fork active on the site, and every lps acf command also answers to lps scf.",
      },
      {
        q: "Which ACF objects does Loopress keep in Git?",
        a: "Field groups, post types, taxonomies and options pages, one JSON file each in acf/. Options pages must be registered with acf_add_options_page() for pull and push to see them.",
      },
      {
        q: "How do I see what a push will change?",
        a: "lps acf diff compares your files with an environment, and lps acf diff --env staging --against production compares two environments. lps push --dry-run previews a whole push without writing anything.",
      },
      {
        q: "What if someone edits a field group in wp-admin?",
        a: "lps acf pull brings the edit back into your files, where you review and commit it. If you push without pulling first, the push from the same machine stops and names the field group changed on the site, unless you pass --overwrite.",
      },
    ],
    docs: [["ACF field groups in Git", `${docs}/acf/`], ["Changes made outside Loopress", `${docs}/concepts/#changes-made-outside-loopress`]],
    recipe: ["Query ACF fields with GraphQL in your own API route", `${docs}/cookbook/search-and-data-services/graphql-wordpress-rest-api-route/`],
  },
  {
    slug: "wp-staging",
    name: "WP Staging and Duplicator",
    kind: "staging and migration plugins",
    heading: "A WP Staging alternative that never pushes your content.",
    seoTitle: "WP Staging and Duplicator Alternative for Developers - Loopress",
    lede: "Staging and migration plugins copy a whole site, database included. Loopress moves only the configuration and code you changed, and never the content.",
    intro: [
      "WP Staging and Duplicator answer one question well: how do I get a full copy of this site somewhere else? They clone files and database together, which is what you want for a backup, a new host or a first staging site. The trouble starts when that copy is also how you ship a small change: pushing staging back means choosing tables and hoping nothing landed in them on production since the clone.",
      "Loopress takes the other approach. The configuration and code you change every week, field groups, menus, post types, options, hooks, live as files in Git. A push sends only those files, after a diff you can read, and never reads or writes posts, orders or users. Your staging plugin keeps its job, it just stops being your deploy tool.",
    ],
    rows: [
      ["What it versions", "Nothing: backups and clones, by date", "Configuration and code, as files in Git"],
      ["What it moves", "A snapshot of the site, files and database", "One file at a time: a field group, a menu, a hook"],
      ["How it deploys", "Push the staging copy back, choosing tables", "lps push over the REST API, no SSH"],
      ["Content touched", "Copied along, so live edits can be overwritten", "Posts, orders and users are never pulled into the repo or pushed"],
      ["Before pushing", "No diff against the last copy", "lps diff shows exactly what will change"],
      ["History", "Backups, by date", "Git history, with a PR per change"],
      ["Undo", "Restore a backup", "Roll back one resource to its pre-push snapshot"],
    ],
    task: {
      title: "Ship a new ACF field while orders keep coming in",
      them: ["Clone production to staging", "Add the field on staging", "Push staging back, choosing which tables to include", "Hope no order or comment landed in those tables since the clone"],
      us: acfShip,
    },
    together: "Keep them for what Loopress doesn't do: full backups, cloning a site, moving to a new host. Use Loopress for the changes you make every week.",
    theirs: "You need to clone a whole site, move it to a new host, or keep full backups. Loopress doesn't do any of that.",
    ours: "You change the same site again and again, and want to ship a field group without touching the orders that came in since the last copy.",
    matrix: tableCopyMatrix,
    gaps: ["yes", "yes", "yes", "no"],
    faq: [
      {
        q: "Does Loopress make backups?",
        a: "No. Every real push saves a snapshot of what it replaced, so that resource can be rolled back, but that is not a site backup. Keep your backup plugin.",
      },
      {
        q: "Can Loopress clone a site to staging?",
        a: "Not as a copy of files and database. lps promote staging production copies every tracked resource from one environment to another, and lps content copy brings posts, pages and terms down to your local site only. Content never goes up.",
      },
      {
        q: "What happens to orders placed while I work on staging?",
        a: "Nothing. A push writes configuration and code only, so posts, orders, comments and users on production are never part of it.",
      },
      {
        q: "Does a push delete what is not in my repo?",
        a: "Not by default: a push creates and updates. The exceptions are explicit and listed first, such as API routes and hooks, which mirror the repo. A push to a production environment asks for confirmation.",
      },
    ],
    docs: [["The push and pull workflow", `${docs}/workflow/`], ["Rollback and snapshots", `${docs}/rollback/`]],
    recipe: ["An events catalog: a custom post type in Git", `${docs}/cookbook/site-as-code/upcoming-events-custom-post-type-wordpress-rest-api/`],
  },
  {
    slug: "wp-migrate",
    name: "WP Migrate",
    kind: "database sync",
    heading: "A WP Migrate alternative for config, not databases.",
    seoTitle: "WP Migrate Alternative: Sync WordPress Config via Git - Loopress",
    lede: "WP Migrate pushes and pulls databases between environments, with find and replace on URLs. Loopress moves configuration as files, one resource at a time.",
    intro: [
      "WP Migrate is the tool many WordPress developers reach for to move a database between local, staging and production, with URLs rewritten on the way. It is very good at pulling production down. Pushing up is where it hurts: a plugin's settings, a menu or a field group live in shared tables, so moving them means moving the tables, and whatever changed on production in the meantime goes with them.",
      "If you are looking for a WP Migrate alternative for that upward direction, Loopress moves configuration as files instead of tables. You pull the options, menus or field groups you care about into Git, review the diff, and push only those to production. Run lps diff first and you see, file by file, what the push would change on the site. Content keeps flowing the other way.",
    ],
    rows: [
      ["What it versions", "Nothing of its own: it exports and moves databases", "Configuration and code, as files in Git"],
      ["What it moves", "Database tables, and files with the Pro add-ons", "Files: one per field group, menu, option, hook"],
      ["How it deploys", "Push or pull tables, find and replace on URLs", "lps push over the REST API, no SSH"],
      ["Content touched", "Travels with the tables you pick", "Never pushed. lps content copy brings it down to local only"],
      ["Before pushing", "Pick tables, no row-level diff", "lps diff, per file"],
      ["History", "None of its own", "Git, with a PR per change"],
    ],
    task: {
      title: "Move a plugin's settings from staging to production",
      them: ["Find which wp_options rows hold that plugin's settings", "Push the options table to production", "Overwrite any setting changed on production meanwhile"],
      us: stagingToProduction("option", "feat: cookie banner settings"),
    },
    together: "Pull production content down to your local site with WP Migrate, ship configuration and code up with Loopress. Content goes down, changes go up.",
    theirs: "You need real content locally, or you're moving a whole database between environments.",
    ours: "What you're moving is configuration, and you want a reviewable diff instead of a table overwrite.",
    matrix: tableCopyMatrix,
    gaps: ["database export", "yes", "yes", "no"],
    faq: [
      {
        q: "How does Loopress handle wp_options?",
        a: "Nothing is tracked by default. You pick each option with lps option add, it becomes one JSON file in options/, and only tracked options are pulled, pushed or compared. lps option list --no-core shows the names, never the values.",
      },
      {
        q: "Does Loopress rewrite URLs like WP Migrate?",
        a: "Not in configuration: an option value is copied as is, so check it doesn't embed ids or URLs of another environment. lps content copy, which brings content down to local, rewrites the source URL to the local one.",
      },
      {
        q: "Can I still pull production content locally?",
        a: "Yes, with WP Migrate or with lps content copy production, which replaces the local posts and terms with production's. Users, comments and orders are never copied, and there is no content push.",
      },
      {
        q: "What if a setting was changed on production since my last push?",
        a: "The push from the same machine stops and names it. Review it with lps diff, bring it into your files with a pull, or pass --overwrite to replace it.",
      },
    ],
    docs: [["Options in Git", `${docs}/options/`], ["lps content copy", `${docs}/workflow/#lps-content-copy`]],
    recipe: ["A client editor role in Git", `${docs}/cookbook/site-as-code/client-editor-role-wordpress/`],
  },
  {
    slug: "bedrock",
    name: "Roots Bedrock",
    kind: "a project structure",
    heading: "A Bedrock alternative for sites that already exist.",
    seoTitle: "Bedrock Alternative for Existing WordPress Sites - Loopress",
    lede: "Bedrock restructures a WordPress project around Composer. Loopress leaves the site as it is and puts its configuration and code in Git.",
    intro: [
      "Bedrock is a solid way to start a WordPress project: Composer for core and plugins, settings in .env, and a layout that keeps code apart from uploads. It is also a decision you make on day one. Moving an existing site to it means a new folder layout, often a new deploy setup, and a host that lets you run Composer and reach the server.",
      "If you want a Bedrock alternative for an existing site, Loopress adds the parts most people want from it without the restructure: plugins pinned in a lockfile, Composer packages installed without SSH, hooks and code in Git. It also covers what Bedrock leaves in the database, menus, options and field groups, as files you can diff and push.",
      "Bedrock still makes sense for a new build on a server you control. This page is for the other case: a site that is already live, maybe on managed hosting with no SSH, where the change that breaks things is a menu edited in wp-admin, or a plugin at one version on staging and another on production.",
    ],
    rows: [
      ["What it versions", "Code, core and plugins through Composer", "Configuration and code, the site's layout unchanged"],
      ["What it moves", "Your repo, through your deploy tool", "The files you changed, one resource at a time"],
      ["How it deploys", "Usually Trellis, which needs SSH and control of the server", "lps push over the REST API, no SSH"],
      ["Content touched", "No", "No: posts, orders and users are never pushed"],
      ["Project layout", "Its own: core in web/wp, code in web/app, settings in .env", "The stock wp-content layout your host already runs"],
      ["Plugins", "Composer, in your repo", "A lockfile in loopress.json, or your composer.json"],
      ["Configuration in the database (menus, options)", "Not covered", "Pulled as files, pushed back, diffed"],
      ["Existing sites", "A migration to the new layout", "Connect and pull, nothing to move"],
    ],
    task: {
      title: "Ship a menu change from staging to production",
      them: ["Nothing in the repo describes the menu", "Redo the change by hand in production's wp-admin"],
      us: stagingToProduction("menu", "feat: footer menu"),
    },
    theirs: "You start a site from scratch, own the server, and want Composer to manage everything including WordPress core.",
    ours: "You look after sites that already exist, on hosts you don't control, and the risky changes are the ones made in wp-admin.",
    matrix: ["no", "no", "no", "code only", "yes", "Trellis needs it"],
    gaps: ["no", "no", "no", "yes, via Composer"],
    faq: [
      {
        q: "Do I have to change my site's folder layout?",
        a: "No. Loopress works on the stock wp-content layout your host already runs. You connect the site, pull, and its configuration becomes files in your project.",
      },
      {
        q: "Can I install Composer packages without SSH?",
        a: "Yes, with Loopress Full. lps composer push sends composer.json and composer.lock and Composer runs inside WordPress. Plugins can also be pinned in loopress.json, installed through Composer and WPackagist.",
      },
      {
        q: "Does Loopress manage the WordPress core version?",
        a: "No, that is one thing Bedrock does that Loopress doesn't. Core stays updated the way your host or wp-admin updates it today.",
      },
      {
        q: "Which Loopress edition do I need?",
        a: "Light, free on WordPress.org, covers configuration: field groups, menus, options, post types, roles and theme styles. Composer packages, plugins, hooks and API routes need Loopress Full.",
      },
    ],
    docs: [["Composer packages without SSH", `${docs}/composer/`], ["Plugins in a lockfile", `${docs}/plugins/`]],
    recipe: ["Render a post as a PDF with a Composer package", `${docs}/cookbook/documents-and-files/post-to-pdf-dompdf-wordpress-rest-api/`],
  },
  {
    slug: "versionpress",
    name: "VersionPress",
    kind: "archived",
    heading: "A VersionPress alternative: WordPress version control in Git.",
    seoTitle: "VersionPress Alternative: WordPress Version Control - Loopress",
    lede: "VersionPress tried to put the whole database in Git, content included. Loopress takes the opposite constraint.",
    intro: [
      "VersionPress promised Git for all of WordPress: every post, every setting, every change in wp-admin as a commit you could undo or merge. The project is archived and never left developer preview, and its hardest problem was the one it chose: merging database rows and content that editors change all day.",
      "Loopress keeps the part of that promise developers need most, history, review and undo for what can break a site, and drops the rest. Configuration and code are plain files in Git: JSON for field groups, menus and options, PHP for hooks and routes. Posts and media stay in WordPress, where editors work, so there is nothing serialized to merge.",
      "In practice, you connect an existing site and run lps pull: its field groups, menus, post types, roles and the options you track become files in your project. From there each change is a commit and a pull request, lps diff shows what a push would change, and a push that turns out wrong is undone with the rollback command of that resource. An edit someone makes in wp-admin is not lost either: the next push from your machine stops on it until you pull it or pass --overwrite.",
    ],
    rows: [
      ["What it versions", "Database and content", "Configuration and code only"],
      ["What it moves", "Database changes, as commits", "Plain files: JSON and PHP"],
      ["How it deploys", "Its own clone, push and pull commands", "lps push over the REST API, no SSH"],
      ["Content touched", "Versioned, so merged like code", "Stays in WordPress, where editors work"],
      ["Requirements", "Git installed on the web server", "The Loopress plugin on the site, the CLI on your machine"],
      ["Status", "Archived, never left developer preview", "Alpha, actively developed"],
      ["Undo", "Revert a commit", "Roll back one resource to its pre-push snapshot"],
    ],
    theirs: "There's no case left: the project is archived.",
    ours: "You wanted what VersionPress promised for the parts of a site that a developer actually changes: field groups, menus, options and code, with a diff before each push and an undo after it.",
    matrix: ["yes", "yes", "yes", "yes", "no, versioned too", "yes"],
    gaps: ["no", "no", "versioned in Git", "no"],
    faq: [
      {
        q: "Is VersionPress still maintained?",
        a: "No. The project is archived and never left developer preview, so there is no release to install on a current site with any support behind it. If you still run it somewhere, Loopress does not read its repository: you start from the site as it is today with lps pull.",
      },
      {
        q: "Does Loopress version posts and pages?",
        a: "Not the content editors write: posts, media and pages edited in wp-admin stay in WordPress, and a push never writes them. With Loopress Full, theme templates and hand-written static pages can live in Git, and a page pushed that way is no longer edited in wp-admin.",
      },
      {
        q: "How do I undo a change with Loopress?",
        a: "Every real push saves a snapshot of what it replaced. lps menu rollback, lps acf rollback and the other rollback commands restore it, and --list shows the snapshots available. --dry-run shows what a rollback would restore before it writes anything, and the history of your files stays in Git like any other code.",
      },
      {
        q: "Is Loopress production ready?",
        a: "It is in alpha and actively developed. A push to a production environment asks for confirmation, and lps diff or lps push --dry-run shows what will change first.",
      },
    ],
    docs: [["Rollback and snapshots", `${docs}/rollback/`], ["Core concepts", `${docs}/concepts/`]],
    recipe: ["Undo a bad deploy with lps diff and rollback", `${docs}/cookbook/site-as-code/undo-bad-deploy-lps-diff-rollback-wordpress/`],
  },
  {
    slug: "wp-cfm",
    name: "WP-CFM",
    kind: "closed on WordPress.org",
    heading: "A WP-CFM alternative: your options in Git, over the REST API.",
    seoTitle: "WP-CFM Alternative After Its Closure - Loopress",
    lede: "WP-CFM was closed on WordPress.org in January 2026. Loopress keeps options as files in Git, reviewed in a PR, and adds ACF, menus and code.",
    intro: [
      "WP-CFM copied database configuration to and from the filesystem: you chose a bundle of settings, it wrote one file per bundle, and you committed those files. Its directory page is closed permanently, the last release listed is 1.7.10, so a new site can't install it from wp-admin anymore. If you searched for a WP-CFM alternative, you probably still want the same thing: settings as files, reviewed in a pull request.",
      "Loopress keeps that. Each option you track is a JSON file in your project, committed and reviewed like code. What changes is the transport. WP-CFM runs on the site itself, so moving a bundle means deploying the files to the server by other means (Git, rsync, your host) and then pulling them in on that site. Loopress talks to each site over the REST API from your machine or from CI: lps option push sends the files, with no deploy of the files first. It also covers what WP-CFM did not: ACF field groups, menus, post types, roles, theme styles and, with Full, hooks and code.",
      "One thing to know before you start: the words go the other way. In WP-CFM, push exports the database settings to the filesystem and pull imports the files into the database. In Loopress, pull brings a site's configuration into your files and push sends your files to the site. Migrating, read every command with that in mind.",
      "There is no import command for a WP-CFM bundle. Migrating is manual and short: open each bundle file, list the option names in it, run lps option add <name> for each one on the site that has the right values, then commit the files in options/. Option values are copied as is, so check that none embeds a post, term or user id before you push it to another environment. WP-CFM's other data types are covered unevenly, see the table.",
    ],
    rows: [
      ["What it versions", "wp_options, multisite wp_sitemeta, taxonomy terms and Custom Field Suite field groups, in bundles", "The options you choose to track, plus ACF field groups, menus, post types, taxonomy registration, roles, theme styles, and code with Full"],
      ["What it moves", "One file per bundle (JSON, or YAML through a filter), in wp-content/config/ by default", "One JSON file per option or resource, in your project"],
      ["How it deploys", "Commit the files, deploy them to the server by other means, then run wp config pull <bundle> on that site", "lps option push --env production, over the REST API"],
      ["Content touched", "Taxonomy terms are part of its data", "No: posts, terms and users are never pushed. lps taxonomy push registers a taxonomy and never touches its terms"],
      ["Multisite", "wp_sitemeta bundles, with --network", "No network-wide options: each site is its own environment"],
      ["Before shipping", "wp config diff <bundle>, and a diff viewer in the admin, on the site the files are on", "lps option diff against any environment, or two environments against each other, with no SSH"],
      ["Status", "Closed on WordPress.org, permanently, last release 1.7.10", "Alpha, actively developed"],
      ["Undo", "Not compared here", "lps option rollback, to the snapshot taken before the push"],
    ],
    task: {
      title: "Ship a changed option to production",
      them: ["Edit the setting, then export its bundle to the filesystem (wp config push <bundle>)", "Commit the bundle file and deploy it to production by other means", "Run wp config diff <bundle>, then wp config pull <bundle> on production"],
      us: `$ lps option pull --env staging
$ git commit -am "Update the site title"
$ lps option diff --env production
$ lps option push --env production`,
    },
    theirs: "You already run it, your needs are options and taxonomy terms in bundles, and you accept a plugin closed on WordPress.org, whose last listed release is 1.7.10.",
    ours: "You want a maintained way to keep options in Git, you need ACF, menus or code too, or you want to diff and ship to any environment from the terminal or CI, without deploying files to each server first.",
    matrix: ["yes", "no", "options only", "yes, on the site the files are on", "no, it can copy terms", "no"],
    gaps: ["no", "no", "taxonomy terms only", "no"],
    faq: [
      {
        q: "Is WP-CFM still available?",
        a: "It was closed on WordPress.org on 2026-01-14, permanently, at the author's request. The last release listed on the directory is 1.7.10. You can no longer install it from wp-admin.",
      },
      {
        q: "Can Loopress import a WP-CFM bundle?",
        a: "No. There is no import command. Read the option names in each bundle file, run lps option add <name> for each one against the site that holds the right values, and commit the resulting files. lps option list shows the option names available on a site.",
      },
      {
        q: "Does Loopress cover everything WP-CFM did?",
        a: "Options, yes, one by one. Multisite wp_sitemeta bundles and Custom Field Suite field groups, no. Taxonomy terms, no: lps taxonomy covers the registration of a taxonomy, never its terms, which stay content in WordPress.",
      },
      {
        q: "Are push and pull the same as in WP-CFM?",
        a: "No, they are reversed. In WP-CFM, push exports the database to files and pull imports files into the database. In Loopress, lps option pull brings the site's value into your files and lps option push sends your files to the site.",
      },
      {
        q: "How do I move an option between environments?",
        a: "lps option pull --env staging writes the tracked options to your files, you commit them, and lps option push --env production sends them. lps option diff shows what a push would change first, and an option marked readonly in its file is skipped by push.",
      },
    ],
    docs: [["Options in Git", `${docs}/options/`], ["Rollback and snapshots", `${docs}/rollback/`]],
    recipe: ["Undo a bad deploy with lps diff and rollback", `${docs}/cookbook/site-as-code/undo-bad-deploy-lps-diff-rollback-wordpress/`],
  },
];
