import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import type { Diagnostics } from '../types';

export function DiagnosticsBanner({ isLocked }: { isLocked: boolean }) {
    const queryClient = useQueryClient();

    const { data: diagnostics } = useQuery<Diagnostics>({
        queryKey: ['diagnostics'],
        queryFn: () => apiFetch<Diagnostics>('/vendor/diagnostics'),
        staleTime: 60_000,
    });

    const { mutate: fixPlatform, isPending: fixing } = useMutation({
        mutationFn: () => apiFetch('/vendor/fix-platform', { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diagnostics'] }),
    });

    if (!diagnostics?.issues?.length) return null;

    return (
        <div style={{ maxWidth: 600, marginBottom: 20 }}>
            {diagnostics.issues.map((issue) => (
                <Notice key={issue.code} status="warning" isDismissible={false}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                            <strong>Platform issue detected</strong>
                            <p style={{ margin: '4px 0 0', fontSize: 13 }}>{issue.message}</p>
                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                                Running PHP {diagnostics.php_version}
                                {diagnostics.platform_php ? ` (composer.json declares ${diagnostics.platform_php})` : ''}
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            size="small"
                            disabled={fixing || isLocked}
                            onClick={() => fixPlatform()}
                            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                            {fixing ? <><Spinner /> Fixing…</> : `Set to PHP ${diagnostics.php_version}`}
                        </Button>
                    </div>
                </Notice>
            ))}
        </div>
    );
}
