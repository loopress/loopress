import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { CopyButton, Pill, ResourceSection, Row, Table } from '../ui';
import { CELL, MONO } from '../helpers';
import { ApiNamespaceSettings } from './ApiNamespaceSettings';
import type { ApiFile, ApiNamespace } from '../types';

// Kept in sync with the plugin's own default (Loopress\Api\ApiNamespace::DEFAULT); only used
// until the /api-namespace query below resolves, or if it errors.
const DEFAULT_NAMESPACE = 'loopress-api/v1';

export function ApiRoutes() {
    const query = useQuery<ApiFile[]>({
        queryKey: ['api-files'],
        queryFn: () => apiFetch<ApiFile[]>('/api-files'),
        staleTime: 30_000,
    });
    const files = query.data ?? [];

    const { data: namespaceData } = useQuery<ApiNamespace>({
        queryKey: ['api-namespace'],
        queryFn: () => apiFetch<ApiNamespace>('/api-namespace'),
    });
    const namespace = namespaceData?.namespace ?? DEFAULT_NAMESPACE;
    const restUrl = window.loopressData?.restUrl ?? '';

    return (
        <ResourceSection
            title="API routes"
            query={query}
            isEmpty={files.length === 0}
            errorText="Failed to load API routes."
            empty={<>No API route files uploaded yet. Push some with <code>lps api push</code>.</>}
        >
            <Table columns={['File', 'Route']}>
                {files.map((file) => (
                    <Row key={file.filename}>
                        <td style={CELL}>
                            <strong>{file.filename}.php</strong>
                            {file.public && (
                                <Pill tone="danger" title="Declares #[Permission(public: true)]: runs for anyone, no authentication">
                                    Public
                                </Pill>
                            )}
                            {file.error && <Pill tone="error">Failed to load</Pill>}
                            {file.error && <div style={{ marginTop: 4, fontSize: 12, color: '#991b1b' }}>{file.error}</div>}
                            <details style={{ marginTop: 4 }}>
                                <summary style={{ cursor: 'pointer', fontSize: 12 }}>View source</summary>
                                <pre style={{
                                    background: '#1e1e1e', color: '#d4d4d4', padding: '10px 14px', borderRadius: 4,
                                    maxHeight: 400, overflow: 'auto', fontSize: 12, marginTop: 6,
                                }}>
                                    {file.content}
                                </pre>
                            </details>
                        </td>
                        <td style={MONO}>
                            <span>{namespace}/{file.filename}</span>
                            {restUrl && <CopyButton label="Copy URL" text={`${restUrl}${namespace}/${file.filename}`} />}
                        </td>
                    </Row>
                ))}
            </Table>
            <ApiNamespaceSettings />
        </ResourceSection>
    );
}
