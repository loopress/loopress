import { useQueries } from '@tanstack/react-query';
import { Notice } from '@wordpress/components';
import { apiFetch } from '../api';

// Same endpoints and query keys as the Config tab, so both share one cache.
const SOURCES = [
    { key: 'registered-post-types', kind: 'Post type' },
    { key: 'registered-taxonomies', kind: 'Taxonomy' },
    { key: 'registered-roles', kind: 'Role' },
    { key: 'registered-post-meta', kind: 'Meta key' },
];

interface Declared {
    slug?: string;
    key?: string;
    conflict: boolean;
}

// A Loopress declaration whose slug something else registered first is skipped at boot: the
// site then runs without it, silently unless someone opens the Config tab.
export function ConflictsBanner() {
    const results = useQueries({
        queries: SOURCES.map(({ key }) => ({
            queryKey: [key],
            queryFn: () => apiFetch<Declared[]>(`/${key}`),
            staleTime: 30_000,
        })),
    });
    const skipped = results.flatMap((result, i) =>
        (Array.isArray(result.data) ? result.data : []).filter((item) => item.conflict).map((item) => `${SOURCES[i].kind} ${item.slug ?? item.key}`),
    );

    if (skipped.length === 0) return null;

    return (
        <div style={{ marginBottom: 20 }}>
            <Notice status="warning" isDismissible={false}>
                <strong>Loopress declarations skipped</strong>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {skipped.join(', ')}: already registered by a theme or plugin first, so the Loopress version
                    is not used. Details in the Config tab.
                </p>
            </Notice>
        </div>
    );
}
