import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import type { SentryConsent } from '../types';

// Page-level banner (rendered in App.tsx, next to UpdateNotice), not inside the Settings
// tab: nobody has decided yet (first run, or right after a reset via SettingsPanel) is a
// state worth surfacing regardless of which tab is open, not something only visible to an
// admin who happens to click into Settings.
export function SentryConsentAlert() {
    const queryClient = useQueryClient();

    const { data } = useQuery<SentryConsent>({
        queryKey: ['sentry-consent'],
        queryFn: () => apiFetch<SentryConsent>('/sentry/consent'),
    });

    const { mutate: setEnabled, isPending } = useMutation({
        mutationFn: (enabled: boolean) => apiFetch<SentryConsent>('/sentry/consent', {
            method: 'PUT',
            body: JSON.stringify({ enabled }),
        }),
        onSuccess: (consent) => queryClient.setQueryData(['sentry-consent'], consent),
    });

    if (data?.enabled !== null) return null;

    return (
        <div style={{ maxWidth: 600, marginBottom: 20 }}>
            <Notice status="info" isDismissible={false}>
                <p style={{ marginTop: 0 }}>
                    <strong>Send crash reports to Loopress?</strong> Errors from Loopress&apos;s own code would be
                    sent to Loopress so we can fix bugs faster. No data from your theme, other plugins, or site
                    visitors is included.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" disabled={isPending} onClick={() => setEnabled(true)}>
                        Allow
                    </Button>
                    <Button variant="secondary" disabled={isPending} onClick={() => setEnabled(false)}>
                        Deny
                    </Button>
                </div>
            </Notice>
        </div>
    );
}
