import { Button, TabPanel } from '@wordpress/components';
import { AppShell } from './AppShell';
import { ConfigPanel } from './config/ConfigPanel';
import { MUTED } from './helpers';
import { ConflictsBanner } from './overview/ConflictsBanner';
import { Overview } from './overview/Overview';
import { useHashTab } from './useHashTab';

const TABS = [
    { name: 'overview', title: 'Overview' },
    { name: 'config', title: 'Config' },
];
const TAB_NAMES = TABS.map((tab) => tab.name);

export default function LightApp() {
    const { activeTab, onSelect } = useHashTab(TAB_NAMES, 'overview');

    return (
        <AppShell edition="Light">
            <p style={{ maxWidth: 600, fontSize: 13, marginTop: 0 }}>
                Loopress Light syncs this site's ACF field groups, forms, menus, options, and the post
                types, taxonomies, post meta keys and roles declared in your project with the
                Loopress CLI, so all of it can live in Git: history, diffs, code review, rollbacks, and
                moves between environments.
            </p>

            <TabPanel key={activeTab} tabs={TABS} initialTabName={activeTab} onSelect={onSelect}>
                {(tab) => (
                    <div style={{ marginTop: 16 }}>
                        {tab.name === 'config' ? <ConfigPanel /> : <><ConflictsBanner /><Overview /></>}
                    </div>
                )}
            </TabPanel>

            <p style={{ color: MUTED, fontSize: 13, marginTop: 32 }}>
                Loopress Full adds hooks, custom API routes, single-page apps, static pages, block
                templates and patterns, snippets and Composer dependencies, free, from loopress.dev
                instead of wordpress.org.{' '}
                <Button variant="link" href="https://docs.loopress.dev/wordpress-plugin/" target="_blank" rel="noreferrer">
                    Get Loopress Full
                </Button>
            </p>
        </AppShell>
    );
}
