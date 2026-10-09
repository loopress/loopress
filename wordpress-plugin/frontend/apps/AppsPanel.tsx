import { useQuery } from '@tanstack/react-query';
import { Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import { CopyButton, Pill, ResourceSection, Row, Table } from '../ui';
import { CELL, MONO, MUTED, timeAgo } from '../helpers';
import type { AppsDiagnostics, RemoteApp } from '../types';

// Mirrors the CLI's own formatter in cli/src/commands/app/list.ts.
function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Read-only view of the single-page apps deployed to this site, same lane as the API Routes
// section: the CLI (`lps app push`) is the source of truth, this panel just reports what landed.
export function AppsPanel() {
    const query = useQuery<RemoteApp[]>({
        queryKey: ['apps'],
        queryFn: () => apiFetch<RemoteApp[]>('/apps'),
        staleTime: 30_000,
    });
    const apps = query.data ?? [];

    // Webserver-level protections Loopress can't enforce from PHP for the publicly served
    // apps/ directory (e.g. nginx ignoring the nosniff .htaccess). Quiet unless there's an
    // issue; a failed/absent probe simply shows nothing. Also reported in Site Health.
    const { data: diagnostics } = useQuery<AppsDiagnostics>({
        queryKey: ['apps-diagnostics'],
        queryFn: () => apiFetch<AppsDiagnostics>('/apps/diagnostics'),
        staleTime: 60_000,
    });

    return (
        <>
            {diagnostics?.issues?.map((issue) => (
                <Notice key={issue.code} status="warning" isDismissible={false}>
                    <strong>Server configuration issue</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>{issue.message}</p>
                </Notice>
            ))}

            <ResourceSection
                title="Single-page apps"
                query={query}
                isEmpty={apps.length === 0}
                errorText="Failed to load apps."
                empty={<>No apps deployed yet. Push a built bundle with <code>lps app push</code>.</>}
            >
                <Table columns={['App', 'Build', 'Files', 'Deployed']}>
                    {apps.map((app) => {
                        const shortcode = `[loopress_app name="${app.name}"]`;
                        return (
                            <Row key={app.name}>
                                <td style={CELL}>
                                    <strong>{app.name}</strong>
                                    {!app.committed && <Pill tone="error">Uploaded, not committed</Pill>}
                                    <div style={{ ...MONO, padding: 0, marginTop: 4, fontSize: 12 }}>
                                        <span>{shortcode}</span>
                                        <CopyButton label="Copy shortcode" text={shortcode} />
                                    </div>
                                </td>
                                <td style={{ ...CELL, fontFamily: 'monospace' }}>{app.buildId ?? '(pending)'}</td>
                                <td style={CELL}>
                                    {app.committed ? `${app.fileCount} (${humanBytes(app.totalBytes)})` : '(pending)'}
                                </td>
                                <td style={{ ...CELL, color: MUTED }} title={app.deployedAt ?? undefined}>
                                    {app.deployedAt ? timeAgo(app.deployedAt) : ''}
                                </td>
                            </Row>
                        );
                    })}
                </Table>
            </ResourceSection>
        </>
    );
}
