import { useQuery } from '@tanstack/react-query';
import { Card, CardBody, CardHeader, Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import { CopyButton, Pill, Row, Skeleton, Table } from '../ui';
import { CELL, MUTED, timeAgo } from '../helpers';
import type { PushEntry, PushedResource, PushSummary } from '../types';

const RECENT = 10;

function who(entry: PushEntry): string {
    return entry.appPassword ? `${entry.user} (${entry.appPassword})` : entry.user;
}

function Status({ resource }: Readonly<{ resource: PushedResource }>) {
    if (resource.drift === null) {
        return <span style={{ color: MUTED }} title="Loopress can't fingerprint this resource">Not tracked</span>;
    }
    return resource.drift
        ? <Pill tone="warning" title="Changed outside the CLI since the last push">Changed since</Pill>
        : <Pill>In sync</Pill>;
}

// Shown until the first push: the commands to get there, with this site's URL ready to paste.
function ConnectCli() {
    const siteUrl = window.loopressData?.siteUrl ?? '';
    const commands = ['npm install -g @loopress/cli', 'lps project config', 'lps init', 'lps acf pull'].join('\n');

    return (
        <Card>
            <CardHeader><h2 style={{ margin: 0, fontSize: 14 }}>Connect your repository</h2></CardHeader>
            <CardBody>
                <p style={{ marginTop: 0, fontSize: 13 }}>
                    Nothing has been pushed to this site yet. Install the Loopress CLI, then point it at this site:
                </p>
                <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: '10px 14px', borderRadius: 4,
                    fontSize: 12, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap',
                }}>
                    {commands}
                </pre>
                {siteUrl && (
                    <p style={{ fontSize: 13, marginBottom: 0 }}>
                        When <code>lps project config</code> asks for the WordPress URL, enter <code>{siteUrl}</code>
                        <CopyButton label="Copy URL" text={siteUrl} />
                    </p>
                )}
            </CardBody>
        </Card>
    );
}

export function Overview() {
    const { data, isPending, isError } = useQuery<PushSummary>({
        queryKey: ['pushes'],
        queryFn: () => apiFetch<PushSummary>('/pushes'),
        staleTime: 30_000,
    });

    if (isPending) return <Skeleton />;
    if (isError) return <Notice status="error" isDismissible={false}>Failed to load the push history.</Notice>;
    if (data.resources.length === 0) return <ConnectCli />;

    const drifted = data.resources.filter((resource) => resource.drift);

    return (
        <>
            {drifted.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <Notice status="warning" isDismissible={false}>
                        {drifted.map((resource) => resource.label).join(', ')} changed on this site since the last push,
                        outside the CLI. Run <code>lps diff</code> to see what, then pull to keep the change or push to undo it.
                    </Notice>
                </div>
            )}

            <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 14, margin: '0 0 12px' }}>Pushed from your repository</h2>
                <Table columns={['What', 'Last push', 'Status']}>
                    {data.resources.map((resource) => (
                        <Row key={resource.resource}>
                            <td style={CELL}>
                                <strong>{resource.label}</strong>
                                <div style={{ color: MUTED, fontSize: 12 }}><code>{resource.command}</code></div>
                            </td>
                            <td style={CELL} title={resource.lastPush.at}>
                                {timeAgo(resource.lastPush.at)}
                                <div style={{ color: MUTED, fontSize: 12 }}>by {who(resource.lastPush)}</div>
                            </td>
                            <td style={CELL}><Status resource={resource} /></td>
                        </Row>
                    ))}
                </Table>
            </section>

            <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 14, margin: '0 0 12px' }}>Recent pushes</h2>
                <ul style={{ margin: 0, fontSize: 13 }}>
                    {data.entries.slice(0, RECENT).map((entry) => (
                        <li key={`${entry.at}-${entry.resource}`} title={entry.at}>
                            <strong>{entry.label}</strong>, {timeAgo(entry.at)}, by {who(entry)}
                        </li>
                    ))}
                </ul>
            </section>

        </>
    );
}
