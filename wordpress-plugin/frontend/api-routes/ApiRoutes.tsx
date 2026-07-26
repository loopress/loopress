import { useQuery } from '@tanstack/react-query';
import { Notice, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import type { ApiFile, ApiNamespace } from '../types';

// Kept in sync with the plugin's own default (Loopress\Api\ApiNamespace::DEFAULT); only used
// until the /api-namespace query below resolves, or if it errors.
const DEFAULT_NAMESPACE = 'loopress-api/v1';

export function ApiRoutes() {
    const { data: files = [], isPending, isFetching, isError } = useQuery<ApiFile[]>({
        queryKey: ['api-files'],
        queryFn: () => apiFetch<ApiFile[]>('/api-files'),
        staleTime: 30_000,
    });

    const { data: namespaceData } = useQuery<ApiNamespace>({
        queryKey: ['api-namespace'],
        queryFn: () => apiFetch<ApiNamespace>('/api-namespace'),
    });
    const namespace = namespaceData?.namespace ?? DEFAULT_NAMESPACE;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>API Routes</strong>
                {isFetching && !isPending && <Spinner />}
            </div>

            {isError && (
                <Notice status="error" isDismissible={false}>
                    Failed to load API routes.
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

            {!isPending && !isError && files.length === 0 && (
                <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
                    No API route files uploaded yet. Push some with <code>lps api push</code>.
                </p>
            )}

            {files.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>File</th>
                            <th style={{ padding: '6px 8px' }}>Route</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((file) => (
                            <tr key={file.filename} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px' }}>
                                    <strong>{file.filename}.php</strong>
                                </td>
                                <td style={{ padding: '8px', fontFamily: 'monospace', color: '#1d4ed8' }}>
                                    {namespace}/{file.filename}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
