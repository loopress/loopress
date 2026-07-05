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
