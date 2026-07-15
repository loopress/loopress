import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Notice, Spinner, TabPanel } from '@wordpress/components';
import { apiFetch } from './api';
import { AppShell } from './AppShell';
import { DiagnosticsBanner } from './dependencies/DiagnosticsBanner';
import { AuditBanner } from './dependencies/AuditBanner';
import { DependencyManagement } from './dependencies/DependencyManagement';

const TABS = [
    { name: 'dependencies', title: 'Dependencies' },
    { name: 'diagnostics', title: 'Diagnostics' },
];

const { autoloadError, pluginVersion } = window.loopressData;

export default function App() {
    const queryClient = useQueryClient();

    const {
        mutate: autoRepair,
        isPending: autoRepairing,
        isSuccess: autoRepairDone,
        isError: autoRepairFailed,
    } = useMutation({
        mutationFn: () => apiFetch('/composer/repair', { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installed-packages'] }),
    });

    useEffect(() => {
        if (autoloadError) autoRepair();
    }, []);

    return (
        <AppShell title="Loopress Full">
            {autoloadError && (
                <div style={{ maxWidth: 600, marginBottom: 20 }}>
                    <Notice
                        status={autoRepairFailed ? 'error' : autoRepairDone ? 'success' : 'warning'}
                        isDismissible={false}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {autoRepairing && <Spinner />}
                            <span>
                                {autoRepairing
                                    ? 'Repairing dependencies...'
                                    : autoRepairDone
                                    ? 'Dependencies repaired successfully.'
                                    : autoRepairFailed
                                    ? `Auto-repair failed: ${autoloadError}`
                                    : `${autoloadError}, repairing...`}
                            </span>
                        </div>
                    </Notice>
                </div>
            )}

            <TabPanel tabs={TABS}>
                {(tab) =>
                    tab.name === 'dependencies' ? (
                        <DependencyManagement />
                    ) : (
                        <>
                            <DiagnosticsBanner />
                            <AuditBanner />
                        </>
                    )
                }
            </TabPanel>
        </AppShell>
    );
}
