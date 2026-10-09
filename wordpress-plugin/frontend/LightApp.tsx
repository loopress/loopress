import { Button, TabPanel } from '@wordpress/components';
import { AppShell } from './AppShell';
import { ConfigPanel } from './config/ConfigPanel';
import { MUTED } from './helpers';
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
                Loopress Light syncs this site's ACF field groups, post types, taxonomies and options
                pages, SEO settings and redirects (Yoast, RankMath), menus, options and forms with the
                Loopress CLI, so all of it can live in Git: history, diffs, code review, rollbacks, and
                moves between environments.
            </p>

            <TabPanel key={activeTab} tabs={TABS} initialTabName={activeTab} onSelect={onSelect}>
                {(tab) => (
                    <div style={{ marginTop: 16 }}>
                        {tab.name === 'config' ? <ConfigPanel /> : <Overview />}
                    </div>
                )}
            </TabPanel>

            <p style={{ color: MUTED, fontSize: 13, marginTop: 32 }}>
                Loopress Full adds snippets, hooks, custom API routes, static pages, single-page apps and
                Composer dependencies, free, from loopress.dev instead of wordpress.org.{' '}
                <Button variant="link" href="https://docs.loopress.dev/wordpress-plugin/" target="_blank" rel="noreferrer">
                    Get Loopress Full
                </Button>
            </p>
        </AppShell>
    );
}
