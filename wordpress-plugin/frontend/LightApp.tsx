import { AppShell } from './AppShell';

export default function LightApp() {
    return (
        <AppShell title="Loopress Light">
            <p style={{ maxWidth: 600, fontSize: 13 }}>
                Loopress Light syncs the code snippets of this site (Code Snippets, WPCode) with
                the Loopress CLI, so they can live in Git and move between environments.
            </p>
            <p style={{ maxWidth: 600, fontSize: 13 }}>
                Pair the CLI with this site, then run <code>lps snippet pull</code> to get started.
            </p>
            <p style={{ maxWidth: 600, fontSize: 13, color: '#50575e' }}>
                Need Composer dependency management too?{' '}
                <a href="https://docs.loopress.dev/wordpress-plugin/" target="_blank" rel="noreferrer">
                    Loopress Full
                </a>{' '}
                adds it, free of charge, downloaded directly from loopress.dev instead of wordpress.org.
            </p>
        </AppShell>
    );
}
