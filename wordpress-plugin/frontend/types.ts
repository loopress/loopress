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

export interface Settings {
    environment: string;
}

export interface SentryConsent {
    // null: the admin has never decided (including right after a reset), distinct from an
    // explicit opt-out (false).
    enabled: boolean | null;
}

export interface UpdateStatus {
    current_version: string;
    latest_version: string | null;
    update_available: boolean;
    release_url: string | null;
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

export type SnippetType = 'php' | 'js' | 'css' | 'html' | 'text';
export type SnippetLocation = 'admin' | 'body' | 'everywhere' | 'footer' | 'frontend' | 'header' | 'once';

export interface Snippet {
    id: number;
    name: string;
    code: string;
    type: SnippetType;
    active: boolean;
    description: string;
    location: SnippetLocation;
    insertMethod: 'auto' | 'shortcode';
    priority: number;
    shortcodeAttributes: string[];
    tags: string[];
}

export type SnippetMigrationDirection = 'wpcode-to-code-snippets' | 'code-snippets-to-wpcode';

export interface SnippetMigrationStatus {
    sourceActive: boolean;
    destinationActive: boolean;
    snippets: Snippet[];
}

export interface SnippetMigrationResult {
    id: number;
    status: 'migrated' | 'error';
    error?: string;
    warning?: string;
}

declare global {
    interface Window {
        loopressData: {
            apiUrl: string;
            nonce: string;
            autoloadError: string | null;
            phpVersion: string;
            pluginVersion: string;
        };
    }
}
