import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, ToggleControl } from '@wordpress/components';
import { apiFetch } from '../api';
import type { UsageStatsConsent } from '../types';

export function UsageStatsSettings() {
    const queryClient = useQueryClient();

    const { data } = useQuery<UsageStatsConsent>({
        queryKey: ['usage-stats-consent'],
        queryFn: () => apiFetch<UsageStatsConsent>('/usage-stats/consent'),
    });

    const { mutate: setEnabled, isPending } = useMutation({
        mutationFn: (enabled: boolean) => apiFetch<UsageStatsConsent>('/usage-stats/consent', {
            method: 'PUT',
            body: JSON.stringify({ enabled }),
        }),
        onSuccess: (consent) => queryClient.setQueryData(['usage-stats-consent'], consent),
    });

    return (
        <Card style={{ maxWidth: 600, marginTop: 12 }}>
            <CardBody>
                <ToggleControl
                    label="Send anonymous usage statistics"
                    checked={data?.enabled ?? false}
                    disabled={!data || isPending}
                    onChange={(enabled: boolean) => setEnabled(enabled)}
                    help="On by default. Twice a day at most, Loopress sends a random site identifier, the Loopress, WordPress and PHP versions, the site language, its timezone and its environment type (production, staging...). Never your site URL, email, content or plugin list."
                />
            </CardBody>
        </Card>
    );
}
