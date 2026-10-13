import { Page } from '@wordpress/admin-ui';
import LogoBlack from '@loopress/assets/loopress-logo-black.svg';
import { EnvironmentBadge } from './EnvironmentBadge';
import { Pill } from './ui';

// The Page header is sticky at top: 0, which in wp-admin slides it under the fixed admin bar.
// Its class is a hashed CSS-module name, hence the suffix match. Below 600px the admin bar
// scrolls away with the page, so the header goes back to the very top.
const STICKY_HEADER = `
#loopress-admin-root :is([class$="__header"],[class*="__header "]){inset-block-start:var(--wp-admin--admin-bar--height,32px)}
@media (max-width:600px){#loopress-admin-root :is([class$="__header"],[class*="__header "]){inset-block-start:0}}
`;

const pluginVersion = window.loopressData?.pluginVersion ?? '';
const environment = window.loopressData?.environment;

export function AppShell({ edition, actions, children }: Readonly<{
    edition: 'Full' | 'Light';
    actions?: React.ReactNode;
    children: React.ReactNode;
}>) {
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
            actions={actions}
            showSidebarToggle={false}
            hasPadding
        >
            <style>{STICKY_HEADER}</style>
            <div style={{ maxWidth: 960, minHeight: 'calc(100vh - 200px)' }}>{children}</div>
        </Page>
    );
}
