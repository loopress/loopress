import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TextControl, Button, Notice } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import type { ApiNamespace } from '../types';

export function ApiNamespaceSettings() {
    const queryClient = useQueryClient();

    const { data } = useQuery<ApiNamespace>({
        queryKey: ['api-namespace'],
        queryFn: () => apiFetch<ApiNamespace>('/api-namespace'),
    });

    // null until the user types: the field then shows the saved namespace without copying
    // server state into local state from an effect.
    const [draft, setDraft] = useState<string | null>(null);
    const value = draft ?? data?.namespace ?? '';

    const { mutate: save, isPending, error } = useMutation({
        mutationFn: (namespace: string) => apiFetch<ApiNamespace>('/api-namespace', {
            method: 'PUT',
            body: JSON.stringify({ namespace }),
        }),
        onSuccess: (result) => {
            queryClient.setQueryData(['api-namespace'], result);
            setDraft(null);
        },
    });

    // Next to the routes it renames rather than on the Settings tab: changing it changes every
    // URL listed right above.
    return (
        <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>Change the routes namespace</summary>
            <div style={{ maxWidth: 480, marginTop: 8 }}>
                <TextControl
                    label="API routes namespace"
                    value={value}
                    disabled={!data || isPending}
                    onChange={setDraft}
                    help="REST namespace your api/ files register under, e.g. hello.php becomes {namespace}/hello. Changing this changes every route's URL."
                />
                {error instanceof ApiError && (
                    <Notice status="error" isDismissible={false}>
                        {error.message}
                    </Notice>
                )}
                <Button
                    variant="secondary"
                    size="small"
                    disabled={!data || isPending || value === data?.namespace}
                    onClick={() => save(value)}
                    style={{ marginTop: 8 }}
                >
                    Save
                </Button>
            </div>
        </details>
    );
}
