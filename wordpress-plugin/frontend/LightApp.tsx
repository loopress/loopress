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
        </AppShell>
    );
}
