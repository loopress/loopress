import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, CheckboxControl, Notice, Spinner } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import type { SnippetMigrationDirection, SnippetMigrationResult, SnippetMigrationStatus } from '../types';

const DIRECTION_LABELS: Record<SnippetMigrationDirection, { source: string; destination: string }> = {
    'wpcode-to-code-snippets': { source: 'WPCode', destination: 'Code Snippets' },
    'code-snippets-to-wpcode': { source: 'Code Snippets', destination: 'WPCode' },
};

export function SnippetMigration({ direction }: { direction: SnippetMigrationDirection }) {
    const { source, destination } = DIRECTION_LABELS[direction];
    const path = `/snippets/migration/${direction}`;
    const queryKey = ['snippet-migration', direction];

    const queryClient = useQueryClient();
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [lastResults, setLastResults] = useState<SnippetMigrationResult[] | null>(null);

    const { data, isPending, isError } = useQuery<SnippetMigrationStatus>({
        queryKey,
        queryFn: () => apiFetch<SnippetMigrationStatus>(path),
        staleTime: 30_000,
    });

    const { destinationActive = false, snippets = [] } = data ?? {};

    const { mutate: migrate, isPending: migrating } = useMutation<SnippetMigrationResult[], ApiError, number[]>({
        mutationFn: (ids) => apiFetch<SnippetMigrationResult[]>(path, {
            method: 'POST',
            body: JSON.stringify({ ids }),
        }),
        onSuccess: (results) => {
            setLastResults(results);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const resultsById = new Map((lastResults ?? []).map((result) => [result.id, result]));
    const allSelected = snippets.length > 0 && selectedIds.size === snippets.length;
    const controlsDisabled = !destinationActive || migrating;

    const toggleOne = (id: number, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    };

    const toggleAll = (checked: boolean) => {
        setSelectedIds(checked ? new Set(snippets.map((snippet) => snippet.id)) : new Set());
    };

    const migratedCount = (lastResults ?? []).filter((result) => result.status === 'migrated').length;
    const errorCount = (lastResults ?? []).filter((result) => result.status === 'error').length;

    return (
        <Card>
            <CardHeader><h3 style={{ margin: 0 }}>Migrate {source} → {destination}</h3></CardHeader>
            <CardBody>
                <p style={{ maxWidth: 600, fontSize: 13, color: '#50575e' }}>
                    Copy your {source} snippets into {destination}. Once a snippet is copied, the {source}{' '}
                    original is deactivated, not deleted, so you can always roll back.
                </p>

                {isPending && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Spinner /> Loading snippets…
                    </div>
                )}

                {isError && (
                    <Notice status="error" isDismissible={false}>
                        Failed to load snippets.
                    </Notice>
                )}

                {!isPending && !isError && !destinationActive && (
                    <Notice status="warning" isDismissible={false}>
                        Install and activate the {destination} plugin to migrate into it.
                    </Notice>
                )}

                {!isPending && !isError && snippets.length === 0 && (
                    <p style={{ color: '#666', fontSize: 13, margin: 0 }}>No {source} snippets to migrate.</p>
                )}

                {!isPending && !isError && snippets.length > 0 && (
                    <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                                    <th style={{ padding: '6px 8px' }}>
                                        <CheckboxControl
                                            checked={allSelected}
                                            disabled={controlsDisabled}
                                            onChange={toggleAll}
                                            label="All"
                                        />
                                    </th>
                                    <th style={{ padding: '6px 8px' }}>Snippet</th>
                                    <th style={{ padding: '6px 8px' }}>Type</th>
                                    <th style={{ padding: '6px 8px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snippets.map((snippet) => {
                                    const result = resultsById.get(snippet.id);
                                    return (
                                        <tr key={snippet.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                            <td style={{ padding: '8px' }}>
                                                <CheckboxControl
                                                    checked={selectedIds.has(snippet.id)}
                                                    disabled={controlsDisabled}
                                                    onChange={(checked: boolean) => toggleOne(snippet.id, checked)}
                                                    label=""
                                                />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <strong>{snippet.name}</strong>{' '}
                                                <span style={{ color: snippet.active ? '#1d4ed8' : '#999' }}>
                                                    ({snippet.active ? 'active' : 'inactive'})
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px' }}>{snippet.type}</td>
                                            <td style={{ padding: '8px' }}>
                                                {result?.status === 'migrated' && !result.warning && (
                                                    <span style={{ color: '#1a7f37' }}>Migrated</span>
                                                )}
                                                {result?.status === 'migrated' && result.warning && (
                                                    <span style={{ color: '#92400e' }} title={result.warning}>
                                                        Migrated (see warning)
                                                    </span>
                                                )}
                                                {result?.status === 'error' && (
                                                    <span style={{ color: '#c00' }}>Failed: {result.error}</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: 16 }}>
                            <Button
                                variant="primary"
                                disabled={selectedIds.size === 0 || controlsDisabled}
                                onClick={() => migrate(Array.from(selectedIds))}
                            >
                                {migrating ? <Spinner /> : `Migrate Selected (${selectedIds.size})`}
                            </Button>
                        </div>
                    </>
                )}

                {lastResults && (
                    <div style={{ marginTop: 16 }}>
                        <Notice
                            status={errorCount > 0 ? 'error' : 'success'}
                            isDismissible={true}
                            onRemove={() => setLastResults(null)}
                        >
                            {migratedCount} migrated, {errorCount} failed.
                        </Notice>
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
