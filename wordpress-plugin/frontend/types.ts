export interface Package {
    name: string;
    version: string;
    constraint?: string;
}

export interface PackagistPackage {
    name: string;
    description?: string;
    downloads?: number;
}

export interface PackageVersion {
    version: string;
    php_compatible: boolean | null;
    php_constraint: string | null;
}

export interface DiagnosticsIssue {
    code: string;
    message: string;
}

export interface Diagnostics {
    php_version: string;
    platform_php: string | null;
    issues: DiagnosticsIssue[];
}

export interface AppsDiagnostics {
    issues: DiagnosticsIssue[];
}

export interface Settings {
    environment: string;
}

export interface SentryConsent {
    // null: the admin has never decided (including right after a reset), distinct from an
    // explicit opt-out (false).
    enabled: boolean | null;
}

export interface UsageStatsConsent {
    enabled: boolean;
}

export interface OutdatedPackage {
    name: string;
    version: string;
    latest: string;
}

export interface ComposerResult {
    message?: string;
    output?: string;
}

export interface AuditAdvisory {
    advisoryId: string;
    packageName: string;
    remoteId: string;
    title: string;
    link: string;
    cve: string | null;
    affectedVersions: string;
    reportedAt: string;
}

export interface AuditResult {
    advisories: Record<string, AuditAdvisory[]>;
    abandoned: Record<string, string | null>;
}

export interface ApiFile {
    filename: string;
    content: string;
    // Present when this file failed to load at the last boot (RouteLoader's tokenizer
    // discovery found the wrong number of classes, a name collision, a parse error...), absent
    // once it reloads clean, see RouteLoader::fail() / ApiDirectory::LOAD_ERRORS_OPTION.
    error?: string;
    // True when the route declares #[Permission(public: true)] on its class or a verb method:
    // it runs for anyone, with no authentication (see PermissionScanner, F1).
    public?: boolean;
}

export interface ApiNamespace {
    namespace: string;
}

// Mirrors HookAttributeScanner::bindingsIn() in the plugin: one #[Action]/#[Filter]/#[Cron]
// method found in the file's source. `hook` is null for a #[Cron] that omits it (HookLoader
// falls back to a name derived from the slug and method at boot time).
export interface HookBinding {
    type: 'action' | 'filter' | 'cron';
    hook: string | null;
    recurrence: string | null;
    // #[Cron] only: when it fires next (ISO 8601), null when not scheduled or when the hook name
    // is derived at boot rather than declared, see HookFilesController::withNextRun().
    nextRun?: string | null;
}

export interface HookFile {
    filename: string;
    content: string;
    // Present when this file failed to load at the last boot, see ApiFile's own `error`.
    error?: string;
    hooks: HookBinding[];
}

// Mirrors AppsController::list_apps() in the plugin.
export interface RemoteApp {
    name: string;
    buildId: string | null;
    routing: string | null;
    deployedAt: string | null;
    fileCount: number;
    totalBytes: number;
    committed: boolean;
}

// Mirrors PushLog::record() / PushLog::summary() in the plugin.
export interface PushEntry {
    resource: string;
    label: string;
    at: string;
    user: string;
    appPassword: string | null;
}

export interface PushedResource {
    resource: string;
    label: string;
    command: string;
    lastPush: PushEntry;
    // true: changed outside the CLI since that push. null: Loopress can't tell for this resource.
    drift: boolean | null;
}

export interface PushSummary {
    entries: PushEntry[];
    resources: PushedResource[];
}

declare global {
    interface Window {
        loopressData: {
            apiUrl: string;
            nonce: string;
            autoloadError: string | null;
            phpVersion: string;
            pluginVersion: string;
            // wp_get_environment_type(): local, development, staging or production.
            environment: string;
            // get_rest_url(), the site's REST root, to show full route URLs.
            restUrl: string;
            // home_url(), what `lps project config` asks for.
            siteUrl: string;
            // Full edition only (ComposerModule): false under DISALLOW_FILE_MODS, every Composer
            // route that writes files then refuses with a 403.
            fileModsAllowed?: boolean;
        };
    }
}
