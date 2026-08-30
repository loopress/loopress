import { useQuery } from '@tanstack/react-query';
import { Notice, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import type { RemoteApp } from '../types';

// Mirrors the CLI's own formatter in cli/src/commands/app/list.ts.
function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Read-only view of the single-page apps deployed to this site, same lane as the API Routes
// tab: the CLI (`lps app push`) is the source of truth, this panel just reports what landed.
export function AppsPanel() {
    const { data: apps = [], isPending, isFetching, isError } = useQuery<RemoteApp[]>({
        queryKey: ['apps'],
        queryFn: () => apiFetch<RemoteApp[]>('/apps'),
        staleTime: 30_000,
    });

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>Single-page apps</strong>
                {isFetching && !isPending && <Spinner />}
            </div>

            {isError && (
                <Notice status="error" isDismissible={false}>
                    Failed to load apps.
                </Notice>
            )}

            {isPending && (
                <>
                    <style>{`@keyframes lp-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                height: 12,
                                width: 220,
                                background: '#e0e0e0',
                                borderRadius: 4,
                                margin: '8px 0',
                                animation: `lp-pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
                            }}
                        />
                    ))}
                </>
            )}

            {!isPending && !isError && apps.length === 0 && (
                <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
                    No apps deployed yet. Push a built bundle with <code>lps app push</code>.
                </p>
            )}

            {apps.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>App</th>
                            <th style={{ padding: '6px 8px' }}>Build</th>
                            <th style={{ padding: '6px 8px' }}>Files</th>
                            <th style={{ padding: '6px 8px' }}>Deployed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {apps.map((app) => (
                            <tr key={app.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px' }}>
                                    <strong>{app.name}</strong>
                                    {!app.committed && (
                                        <span
                                            style={{
                                                marginLeft: 8,
                                                fontSize: 11,
                                                fontWeight: 500,
                                                color: '#991b1b',
                                                background: '#fee2e2',
                                                borderRadius: 12,
                                                padding: '2px 8px',
                                            }}
                                        >
                                            Uploaded, not committed
                                        </span>
                                    )}
                                    <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12, color: '#1d4ed8' }}>
                                        {`[loopress_app name="${app.name}"]`}
                                    </div>
                                </td>
                                <td style={{ padding: '8px', fontFamily: 'monospace' }}>{app.buildId ?? '(pending)'}</td>
                                <td style={{ padding: '8px' }}>
                                    {app.committed ? `${app.fileCount} (${humanBytes(app.totalBytes)})` : '(pending)'}
                                </td>
                                <td style={{ padding: '8px', color: '#666' }}>{app.deployedAt ?? ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
