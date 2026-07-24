import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, ToggleControl } from '@wordpress/components';
import { apiFetch } from '../api';
import type { SentryConsent } from '../types';

export function SentrySettings() {
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

    return (
        <Card style={{ maxWidth: 600 }}>
            <CardBody>
                <ToggleControl
                    label="Send crash reports to Loopress"
                    checked={data?.enabled ?? false}
                    disabled={!data || isPending}
                    onChange={(enabled: boolean) => setEnabled(enabled)}
                    help="Off by default. When enabled, errors from Loopress's own code are sent to Loopress so we can fix bugs faster. No data from your theme, other plugins, or site visitors is included."
                />
            </CardBody>
        </Card>
    );
}
