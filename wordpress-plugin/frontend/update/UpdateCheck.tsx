import { useMutation } from '@tanstack/react-query';
import { Button } from '@wordpress/components';
import { apiFetch } from '../api';
import { MUTED } from '../helpers';
import type { UpdateStatus } from '../types';

// Full edition only (rendered from App.tsx, never from the shared AppShell): Loopress Light
// updates through wordpress.org and must not carry an update check of its own.
function result(status: UpdateStatus | undefined, failed: boolean): React.ReactNode {
    if (failed) return <span style={{ color: '#cc1818' }}>Check failed, try again later</span>;
    if (!status) return null;
    if (status.update_available) {
        return (
            <>
                <span>Version {status.latest_version} available</span>
                <Button variant="primary" size="small" href="plugins.php">Update</Button>
            </>
        );
    }
    // No version at all: GitHub unreachable or rate limited, not "up to date".
    if (!status.latest_version) return <span style={{ color: '#cc1818' }}>Couldn&apos;t reach GitHub, try again later</span>;
    return <span style={{ color: MUTED }}>Up to date</span>;
}

export function UpdateCheck() {
    const { mutate: check, isPending, data, isError } = useMutation<UpdateStatus>({
        mutationFn: () => apiFetch<UpdateStatus>('/update/check', { method: 'POST' }),
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!isPending && result(data, isError)}
            </span>
            <Button variant="secondary" size="small" isBusy={isPending} disabled={isPending} onClick={() => check()}>
                {isPending ? 'Checking…' : 'Check for updates'}
            </Button>
        </div>
    );
}
