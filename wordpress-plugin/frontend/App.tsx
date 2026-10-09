import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Notice, Spinner, TabPanel } from '@wordpress/components';
import { apiFetch } from './api';
import { AppShell } from './AppShell';
import { DependencyManagement } from './dependencies/DependencyManagement';
import { CodePanel } from './CodePanel';
import { SettingsPanel } from './settings/SettingsPanel';
import { SentryConsentAlert } from './settings/SentryConsentAlert';
import { useHashTab } from './useHashTab';

// No Diagnostics tab: platform and webserver checks live in WordPress's own Site Health
// (see Infrastructure\SiteHealth), and the Dependencies tab shows them only when something is
// wrong. No update banner either: Loopress Full updates natively from the Plugins page.
const TABS = [
    { name: 'dependencies', title: 'Dependencies' },
    { name: 'code', title: 'Code' },
    { name: 'settings', title: 'Settings' },
];
const TAB_NAMES = TABS.map((tab) => tab.name);

const { autoloadError, fileModsAllowed } = window.loopressData;

function repairNotice(
    canRepair: boolean,
    repairing: boolean,
    done: boolean,
    failed: boolean,
): { status: 'error' | 'success' | 'warning'; message: string } {
    if (!canRepair) {
        return {
            status: 'error',
            message: `${autoloadError}. File modifications are disabled on this site, run composer install from your deployment instead.`,
        };
    }
    if (repairing) return { status: 'warning', message: 'Repairing dependencies...' };
    if (done) return { status: 'success', message: 'Dependencies repaired successfully.' };
    if (failed) return { status: 'error', message: `Auto-repair failed: ${autoloadError}` };
    return { status: 'warning', message: `${autoloadError}, repairing...` };
}

export default function App() {
    const queryClient = useQueryClient();
    const { activeTab, onSelect } = useHashTab(TAB_NAMES, 'dependencies');
    // Repairing runs composer install: off limits under DISALLOW_FILE_MODS, the endpoint refuses.
    const canRepair = fileModsAllowed !== false;

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
        if (autoloadError && canRepair) autoRepair();
    }, []);

    const repair = repairNotice(canRepair, autoRepairing, autoRepairDone, autoRepairFailed);

    return (
        <AppShell edition="Full">
            <SentryConsentAlert />

            {autoloadError && (
                <div style={{ marginBottom: 20 }}>
                    <Notice status={repair.status} isDismissible={false}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {autoRepairing && <Spinner />}
                            <span>{repair.message}</span>
                        </div>
                    </Notice>
                </div>
            )}

            <TabPanel key={activeTab} tabs={TABS} initialTabName={activeTab} onSelect={onSelect}>
                {(tab) => (
                    <div style={{ marginTop: 16 }}>
                        {tab.name === 'code' ? (
                            <CodePanel />
                        ) : tab.name === 'settings' ? (
                            <SettingsPanel />
                        ) : (
                            <DependencyManagement />
                        )}
                    </div>
                )}
            </TabPanel>
        </AppShell>
    );
}
