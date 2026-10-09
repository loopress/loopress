import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@wordpress/components';
import { apiFetch } from '../api';
import { SentrySettings } from './SentrySettings';
import { UsageStatsSettings } from './UsageStatsSettings';

// One reset button for every Loopress setting rendered on this tab, not one per feature
// card: as more settings join SentrySettings here, they only need their own query key
// invalidated below, not their own reset endpoint or button.
export function SettingsPanel() {
    const queryClient = useQueryClient();

    const { mutate: resetAll, isPending } = useMutation({
        mutationFn: () => apiFetch('/settings', { method: 'DELETE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sentry-consent'] });
            queryClient.invalidateQueries({ queryKey: ['usage-stats-consent'] });
            queryClient.invalidateQueries({ queryKey: ['api-namespace'] });
        },
    });

    return (
        <div>
            <SentrySettings />
            <UsageStatsSettings />
            <Button
                variant="tertiary"
                size="small"
                disabled={isPending}
                onClick={() => {
                    if (window.confirm('Reset every Loopress setting to its default, including the API routes namespace?')) resetAll();
                }}
                style={{ marginTop: 12 }}
            >
                Reset all settings to default
            </Button>
        </div>
    );
}
