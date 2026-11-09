import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, TextControl } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import type { SiteReportState } from '../types';

// Saving sends one report right away, so the answer tells the admin whether the token works:
// a rejected token (revoked, or issued for another site) is not kept.
export function SiteReportSettings() {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState('');

    const { data } = useQuery<SiteReportState>({
        queryKey: ['site-report'],
        queryFn: () => apiFetch<SiteReportState>('/site-report'),
    });

    const connect = useMutation({
        mutationFn: (token: string) => apiFetch<SiteReportState>('/site-report', {
            method: 'PUT',
            body: JSON.stringify({ token }),
        }),
        onSuccess: (state) => {
            queryClient.setQueryData(['site-report'], state);
            setDraft('');
        },
    });

    const disconnect = useMutation({
        mutationFn: () => apiFetch<SiteReportState>('/site-report', { method: 'DELETE' }),
        onSuccess: (state) => {
            queryClient.setQueryData(['site-report'], state);
            connect.reset();
        },
    });

    const busy = !data || connect.isPending || disconnect.isPending;
    const cloned = data?.connectedUrl != null && data.connectedUrl !== data.url;

    return (
        <div style={{ maxWidth: 480 }}>
            {data?.connected ? (
                <>
                    <p style={{ marginTop: 0 }}>
                        Connected with <code>{data.token}</code>. This site reports its versions, plugins, pending
                        updates and Site Health to the console twice a day.
                    </p>
                    {connect.data?.result === 'unreachable' && (
                        <Notice status="warning" isDismissible={false}>
                            Token saved, but the Loopress console could not be reached. The next report will retry.
                        </Notice>
                    )}
                    {cloned && (
                        <Notice status="warning" isDismissible={false}>
                            This token was connected from {data.connectedUrl}. The console rejects reports from this
                            site: generate a token for this environment and paste it here.
                        </Notice>
                    )}
                    <Button
                        variant="secondary"
                        size="small"
                        isDestructive
                        disabled={busy}
                        onClick={() => disconnect.mutate()}
                        style={{ marginTop: 8 }}
                    >
                        Disconnect
                    </Button>
                </>
            ) : (
                <>
                    <TextControl
                        label="Site token"
                        value={draft}
                        disabled={busy}
                        onChange={setDraft}
                        help="Generate it in the Loopress console, from the environment's menu: Connect site. It starts with lps_site_."
                    />
                    {connect.error instanceof ApiError && (
                        <Notice status="error" isDismissible={false}>
                            {connect.error.message}
                        </Notice>
                    )}
                    <Button
                        variant="secondary"
                        size="small"
                        disabled={busy || draft.trim() === ''}
                        onClick={() => connect.mutate(draft.trim())}
                        style={{ marginTop: 8 }}
                    >
                        Connect
                    </Button>
                </>
            )}
        </div>
    );
}
