import { Page } from '@wordpress/admin-ui';
import LogoBlack from '@loopress/assets/loopress-logo-black.svg';
import { EnvironmentBadge } from './EnvironmentBadge';
import { Pill } from './ui';

const pluginVersion = window.loopressData?.pluginVersion ?? '';
const environment = window.loopressData?.environment;

export function AppShell({ edition, children }: Readonly<{ edition: 'Full' | 'Light'; children: React.ReactNode }>) {
    return (
        <Page
            title="Loopress"
            visual={<img src={LogoBlack} alt="" height={30} />}
            badges={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Pill>{edition} v{pluginVersion}</Pill>
                    {environment && <EnvironmentBadge environment={environment} />}
                </span>
            }
            showSidebarToggle={false}
            hasPadding
        >
            <div style={{ maxWidth: 960, minHeight: 'calc(100vh - 200px)' }}>{children}</div>
        </Page>
    );
}
