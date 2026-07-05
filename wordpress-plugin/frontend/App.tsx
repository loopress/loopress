import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import LogoBlack from '@loopress/assets/loopress-logo-black.svg';
import { Notice, Spinner, TabPanel } from '@wordpress/components';
import { apiFetch } from './api';
import { DiagnosticsBanner } from './components/DiagnosticsBanner';
import { AuditBanner } from './components/AuditBanner';
import { DependencyManagement } from './components/DependencyManagement';

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
        <div className="wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                <img src={LogoBlack} alt="Loopress" height={30} />
                <h1 style={{ margin: 0 }}>Loopress</h1>
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: '#50575e',
                        background: '#f0f0f1',
                        borderRadius: 12,
                        padding: '2px 10px',
                    }}
                >
                    v{pluginVersion}
                </span>
            </div>

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
                                    ? 'Repairing dependencies…'
                                    : autoRepairDone
                                    ? 'Dependencies repaired successfully.'
                                    : autoRepairFailed
                                    ? `Auto-repair failed: ${autoloadError}`
                                    : `${autoloadError} — repairing…`}
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
        </div>
    );
}
