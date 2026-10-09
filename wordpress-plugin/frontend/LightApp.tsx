import { Button } from '@wordpress/components';
import { AppShell } from './AppShell';
import { MUTED } from './helpers';
import { Overview } from './overview/Overview';

export default function LightApp() {
    return (
        <AppShell edition="Light">
            <p style={{ maxWidth: 600, fontSize: 13, marginTop: 0 }}>
                Loopress Light syncs this site's ACF field groups, post types, taxonomies and options
                pages, SEO settings and redirects (Yoast, RankMath), menus, options and forms with the
                Loopress CLI, so all of it can live in Git: history, diffs, code review, rollbacks, and
                moves between environments.
            </p>

            <Overview />

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
