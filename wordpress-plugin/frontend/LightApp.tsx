import { AppShell } from './AppShell';

export default function LightApp() {
    return (
        <AppShell title="Loopress Light">
            <p style={{ maxWidth: 600, fontSize: 13 }}>
                Loopress Light syncs this site's ACF field groups and SEO settings (Yoast,
                RankMath) with the Loopress CLI, so they can live in Git and move between
                environments.
            </p>
            <p style={{ maxWidth: 600, fontSize: 13 }}>
                Pair the CLI with this site, then run <code>lps acf pull</code> or{' '}
                <code>lps seo pull</code> to get started.
            </p>
            <p style={{ maxWidth: 600, fontSize: 13, color: '#50575e' }}>
                Need code snippet sync (Code Snippets, WPCode) or Composer dependency management
                too?{' '}
                <a href="https://docs.loopress.dev/wordpress-plugin/" target="_blank" rel="noreferrer">
                    Loopress Full
                </a>{' '}
                adds both, free of charge, downloaded directly from loopress.dev instead of
                wordpress.org.
            </p>
        </AppShell>
    );
}
