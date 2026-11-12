import { useQuery } from '@tanstack/react-query';
import { TextControl } from '@wordpress/components';
import { apiFetch } from '../api';
import type { ApiNamespace } from '../types';

export function ApiNamespaceSettings() {
    const { data } = useQuery<ApiNamespace>({
        queryKey: ['api-namespace'],
        queryFn: () => apiFetch<ApiNamespace>('/api-namespace'),
    });

    // Read-only: the namespace is code configuration, so it lives in the repo (loopress.json)
    // and `lps api push` sends it. Rendered twice: on the Settings tab, and in the gear popover of
    // the API routes card, since changing it changes every route URL listed there.
    return (
        <div style={{ maxWidth: 480 }}>
            <TextControl
                label="API routes namespace"
                value={data?.namespace ?? ''}
                disabled
                onChange={() => {}}
                help={<>REST namespace your api/ files register under, e.g. hello.php becomes {'{namespace}'}/hello. Read-only here: change <code>api.namespace</code> in <code>loopress.json</code> and run <code>lps api push</code>. Changing it changes every route&apos;s URL.</>}
            />
        </div>
    );
}
