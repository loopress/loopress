import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { EnvironmentBadge } from './components/EnvironmentBadge';
import { DiagnosticsBanner } from './components/DiagnosticsBanner';
import { AuditBanner } from './components/AuditBanner';
import { InstalledPackages } from './components/InstalledPackages';
import { DependencyManagement } from './components/DependencyManagement';
import type { Settings } from './types';

export default function App() {
    const { data: settings } = useQuery<Settings>({
        queryKey: ['settings'],
        queryFn: () => apiFetch<Settings>('/settings'),
    });

    return (
        <div className="wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                <h1 style={{ margin: 0 }}>Loopress</h1>
                {settings && <EnvironmentBadge environment={settings.environment} />}
            </div>
            <p>Welcome to the Loopress plugin settings.</p>

            <DiagnosticsBanner />

            <AuditBanner />

            <DependencyManagement />

            <div style={{marginTop: 20}}>
                <InstalledPackages />
            </div>
        </div>
    );
}
