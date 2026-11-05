import { Page } from '@wordpress/admin-ui';
import LogoBlack from '@loopress/assets/loopress-logo-black.svg';
import { EnvironmentBadge } from './EnvironmentBadge';
import { Pill } from './ui';

// The Page header is sticky at top: 0, which in wp-admin slides it under the fixed admin bar.
// Its class is a hashed CSS-module name, hence the suffix match. Below 600px the admin bar
// scrolls away with the page, so the header goes back to the very top.
//
// This is also the one shared sheet for the responsive rules of both editions (Full and Light):
// no page-level horizontal scroll down to 360px. Wide tables scroll inside .lp-table-scroll,
// header and action bars wrap, and the tab strip scrolls under 600px.
const ADMIN_CSS = `
#loopress-admin-root :is([class$="__header"],[class*="__header "]){inset-block-start:var(--wp-admin--admin-bar--height,32px)}
@media (max-width:600px){#loopress-admin-root :is([class$="__header"],[class*="__header "]){inset-block-start:0}}
#loopress-admin-root{max-width:100%;overflow-x:clip}
#loopress-admin-root :is([class$="__header"],[class*="__header "]){flex-wrap:wrap;max-width:100%}
#loopress-admin-root :is([class$="__header"],[class*="__header "]) *{min-width:0}
#loopress-admin-root .lp-table-scroll{max-width:100%;overflow-x:auto}
#loopress-admin-root .lp-section-head{flex-wrap:wrap;gap:8px}
#loopress-admin-root .lp-section-head>*{min-width:0}
#loopress-admin-root .components-card__body{overflow-wrap:anywhere}
#loopress-admin-root .components-card__body pre{max-width:100%;overflow-x:auto}
@media (max-width:600px){
#loopress-admin-root .components-tab-panel__tabs{overflow-x:auto;max-width:100%;flex-wrap:nowrap}
#loopress-admin-root .components-tab-panel__tabs>*{flex:0 0 auto}
}
`;

const pluginVersion = window.loopressData?.sourceCheckout ? 'dev' : `v${window.loopressData?.pluginVersion ?? ''}`;
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
                    <Pill>{edition} {pluginVersion}</Pill>
                    {environment && <EnvironmentBadge environment={environment} />}
                </span>
            }
            actions={actions}
            showSidebarToggle={false}
            hasPadding
        >
            <style>{ADMIN_CSS}</style>
            <div style={{ maxWidth: 960, minHeight: 'calc(100vh - 200px)' }}>{children}</div>
        </Page>
    );
}
