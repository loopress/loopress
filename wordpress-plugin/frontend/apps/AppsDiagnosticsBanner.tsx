import { useQuery } from '@tanstack/react-query';
import { Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import type { AppsDiagnostics } from '../types';

// Webserver-level protections Loopress can't enforce from PHP for the publicly served
// apps/ directory (e.g. nginx ignoring the nosniff .htaccess). Quiet unless there's an
// issue; a failed/absent probe simply shows nothing. Also reported in Site Health.
export function AppsDiagnosticsBanner() {
    const { data: diagnostics } = useQuery<AppsDiagnostics>({
        queryKey: ['apps-diagnostics'],
        queryFn: () => apiFetch<AppsDiagnostics>('/apps/diagnostics'),
        staleTime: 60_000,
    });

    if (!diagnostics?.issues?.length) return null;

    return (
        <div style={{ marginBottom: 20 }}>
            {diagnostics.issues.map((issue) => (
                <Notice key={issue.code} status="warning" isDismissible={false}>
                    <strong>Server configuration issue</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>{issue.message}</p>
                </Notice>
            ))}
        </div>
    );
}
