import { useQuery } from '@tanstack/react-query';
import { Button, Dropdown } from '@wordpress/components';
import { apiFetch } from '../api';
import { CopyButton, Pill, ResourceSection, Row, SourceDrawer, Table } from '../ui';
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
            actions={(
                <Dropdown
                    popoverProps={{ placement: 'bottom-end' }}
                    renderToggle={({ isOpen, onToggle }) => (
                        <Button icon="admin-generic" label="Routes namespace" size="small" onClick={onToggle} aria-expanded={isOpen} />
                    )}
                    renderContent={() => <div style={{ padding: 16, width: 360 }}><ApiNamespaceSettings /></div>}
                />
            )}
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
                            <div><SourceDrawer title={`${file.filename}.php`} content={file.content} /></div>
                        </td>
                        <td style={MONO}>
                            <span>{namespace}/{file.filename}</span>
                            {restUrl && <CopyButton label="Copy URL" text={`${restUrl}${namespace}/${file.filename}`} />}
                        </td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}
