import { useQueries } from '@tanstack/react-query';
import { Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import type { ApiFile } from '../types';

// Same endpoints and query keys as the Code tab, so both share one cache.
const SOURCES = [
    { key: 'api-files', kind: 'API route' },
    { key: 'hook-files', kind: 'Hook' },
];

// A pushed file that failed to load at boot does nothing on the site until it is fixed.
export function LoadErrorsBanner() {
    const results = useQueries({
        queries: SOURCES.map(({ key }) => ({
            queryKey: [key],
            queryFn: () => apiFetch<ApiFile[]>(`/${key}`),
            staleTime: 30_000,
        })),
    });
    const failed = results.flatMap((result, i) =>
        (Array.isArray(result.data) ? result.data : []).filter((file) => file.error).map((file) => ({ ...file, kind: SOURCES[i].kind })),
    );

    if (failed.length === 0) return null;

    return (
        <div style={{ marginBottom: 20 }}>
            {failed.map((file) => (
                <Notice key={`${file.kind}-${file.filename}`} status="error" isDismissible={false}>
                    <strong>{file.kind} {file.filename}.php failed to load</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>{file.error}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                        Fix it in your repository and push again. Details in the Code tab.
                    </p>
                </Notice>
            ))}
        </div>
    );
}
