import { Button, Card, CardBody, CardHeader, Notice } from '@wordpress/components';
import { AppShell } from './AppShell';

const GET_STARTED_COMMANDS = [
    'npm install -g @loopress/cli',
    'lps project config',
    'lps acf pull',
    'lps seo pull',
].join('\n');

export default function LightApp() {
    return (
        <AppShell title="Loopress Light">
            <p style={{ maxWidth: 600, fontSize: 13 }}>
                Loopress Light syncs this site's ACF field groups, post types, taxonomies, and
                options pages, and its SEO settings and redirects (Yoast, RankMath), with the
                Loopress CLI, so all of it can live in Git: history, diffs, code review,
                rollbacks, and moves between environments.
            </p>

            <div style={{ maxWidth: 600, marginTop: 20 }}>
                <Card>
                    <CardHeader>
                        <h3 style={{ margin: 0, fontSize: 14 }}>Get started</h3>
                    </CardHeader>
                    <CardBody>
                        <pre
                            style={{
                                background: '#1e1e1e',
                                color: '#d4d4d4',
                                padding: '10px 14px',
                                borderRadius: 4,
                                fontSize: 12,
                                lineHeight: 1.8,
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {GET_STARTED_COMMANDS}
                        </pre>
                    </CardBody>
                </Card>
            </div>

            <div style={{ maxWidth: 600, marginTop: 20 }}>
                <Notice status="info" isDismissible={false}>
                    <p style={{ marginTop: 0 }}>
                        <strong>Want more?</strong> Loopress Full adds code snippet sync (Code
                        Snippets, WPCode), Composer dependency management, a security audit, and
                        platform diagnostics, free of charge, downloaded directly from
                        loopress.dev instead of wordpress.org.
                    </p>
                    <Button
                        variant="primary"
                        href="https://docs.loopress.dev/wordpress-plugin/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Get Loopress Full
                    </Button>
                </Notice>
            </div>
        </AppShell>
    );
}
