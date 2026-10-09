import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import type { Diagnostics } from '../types';

export function DiagnosticsBanner() {
    const queryClient = useQueryClient();

    const { data: diagnostics, isError } = useQuery<Diagnostics>({
        queryKey: ['diagnostics'],
        queryFn: () => apiFetch<Diagnostics>('/composer/diagnostics'),
        staleTime: 60_000,
    });

    const { mutate: fixPlatform, isPending: fixing } = useMutation({
        mutationFn: () => apiFetch('/composer/fix-platform', { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diagnostics'] }),
    });

    if (isError) return null;
    // Nothing while loading either: this usually renders nothing, a skeleton would only jump.
    if (!diagnostics) return null;

    // Quiet when healthy: the same checks are listed as passed in Tools > Site Health.
    if (!diagnostics.issues.length) return null;

    const canFix = window.loopressData?.fileModsAllowed !== false;

    return (
        <div style={{ marginBottom: 20 }}>
            {diagnostics.issues.map((issue) => {
                const isPlatformIssue = issue.code === 'platform_php_missing' || issue.code === 'platform_php_mismatch';

                return (
                    <Notice key={issue.code} status="warning" isDismissible={false}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <strong>{isPlatformIssue ? 'Platform issue detected' : 'Diagnostics issue detected'}</strong>
                                <p style={{ margin: '4px 0 0', fontSize: 13 }}>{issue.message}</p>
                                {isPlatformIssue && (
                                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                                        Running PHP {diagnostics.php_version}
                                        {diagnostics.platform_php ? ` (composer.json declares ${diagnostics.platform_php})` : ''}
                                    </p>
                                )}
                            </div>
                            {isPlatformIssue && canFix && (
                                <Button
                                    variant="secondary"
                                    size="small"
                                    disabled={fixing}
                                    onClick={() => fixPlatform()}
                                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                                >
                                    {fixing ? <><Spinner /> Fixing…</> : `Set to PHP ${diagnostics.php_version}`}
                                </Button>
                            )}
                        </div>
                    </Notice>
                );
            })}
        </div>
    );
}
