import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Spinner } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import { Pill, Row, Skeleton, Table } from '../ui';
import { CELL, confirmChange, MONO, MUTED } from '../helpers';
import { ComposerOutput } from './ComposerOutput';
import type { Package, OutdatedPackage, ComposerResult } from '../types';

interface ActionState {
    action: 'removed' | 'updated';
    name: string;
    output?: string | null;
    error: string | null;
}

export function InstalledPackages({ readOnly = false }: Readonly<{ readOnly?: boolean }>) {
    const queryClient = useQueryClient();
    const [actionResult, setActionResult] = useState<ActionState | null>(null);

    const { data: packages = [], isPending, isFetching, isError } = useQuery<Package[]>({
        queryKey: ['installed-packages'],
        queryFn: () => apiFetch<Package[]>('/composer/installed'),
        staleTime: 30_000,
    });

    const { data: outdated = [] } = useQuery<OutdatedPackage[]>({
        queryKey: ['outdated-packages'],
        queryFn: () => apiFetch<OutdatedPackage[]>('/composer/outdated'),
        staleTime: 5 * 60_000,
    });
    const outdatedByName = new Map(outdated.map((pkg) => [pkg.name, pkg]));

    const { mutate: removePackage, isPending: removing, variables: removingPkg } = useMutation<ComposerResult, ApiError, string>({
        mutationFn: (packageName) => apiFetch<ComposerResult>('/composer/remove', {
            method: 'POST',
            body: JSON.stringify({ package: packageName }),
        }),
        onSuccess: (data, packageName) => {
            setActionResult({ action: 'removed', name: packageName, output: data?.output, error: null });
            queryClient.invalidateQueries({ queryKey: ['installed-packages'] });
        },
        onError: (err, packageName) => {
            setActionResult({ action: 'removed', name: packageName, output: err.output, error: err.message });
        },
    });

    const { mutate: updatePackage, isPending: updating, variables: updatingPkg } = useMutation<ComposerResult, ApiError, { name: string; version: string }>({
        mutationFn: ({ name, version }) => apiFetch<ComposerResult>('/composer/require', {
            method: 'POST',
            body: JSON.stringify({ package: name, version }),
        }),
        onSuccess: (data, { name }) => {
            setActionResult({ action: 'updated', name, output: data?.output, error: null });
            queryClient.invalidateQueries({ queryKey: ['installed-packages'] });
            queryClient.invalidateQueries({ queryKey: ['outdated-packages'] });
        },
        onError: (err, { name }) => {
            setActionResult({ action: 'updated', name, output: err.output, error: err.message });
        },
    });

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>Installed packages</strong>
                {isFetching && !isPending && <Spinner />}
            </div>

            {isError && (
                <Notice status="error" isDismissible={false}>
                    Failed to load installed packages.
                </Notice>
            )}

            {isPending && <Skeleton />}

            {!isPending && !isError && packages.length === 0 && (
                <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
                    No packages installed yet.{!readOnly && ' Search for a package to get started.'}
                </p>
            )}

            {packages.length > 0 && (
                <Table columns={readOnly ? ['Package', 'Version'] : ['Package', 'Version', '']}>
                    {packages.map((pkg) => {
                        const isRemoving = removing && removingPkg === pkg.name;
                        const isUpdating = updating && updatingPkg?.name === pkg.name;
                        const update = outdatedByName.get(pkg.name);
                        return (
                            <Row key={pkg.name}>
                                <td style={CELL}><strong>{pkg.name}</strong></td>
                                <td style={{ ...MONO, whiteSpace: 'nowrap' }}>
                                    <span>{pkg.version}</span>
                                    {update && <Pill tone="warning">update: {update.latest}</Pill>}
                                </td>
                                {!readOnly && (
                                    <td style={{ ...CELL, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {update && (
                                            <Button
                                                variant="secondary"
                                                size="small"
                                                disabled={updating || removing}
                                                onClick={() => {
                                                    if (confirmChange(`Update ${pkg.name} to ${update.latest}?`)) {
                                                        updatePackage({ name: pkg.name, version: update.latest });
                                                    }
                                                }}
                                                style={{ marginRight: 8 }}
                                            >
                                                {isUpdating ? <Spinner /> : 'Update'}
                                            </Button>
                                        )}
                                        <Button
                                            variant="tertiary"
                                            isDestructive
                                            size="small"
                                            disabled={updating || removing}
                                            onClick={() => {
                                                if (confirmChange(`Remove ${pkg.name}? Code that uses it will stop working.`, true)) {
                                                    removePackage(pkg.name);
                                                }
                                            }}
                                        >
                                            {isRemoving ? <Spinner /> : 'Remove'}
                                        </Button>
                                    </td>
                                )}
                            </Row>
                        );
                    })}
                </Table>
            )}

            {actionResult && (
                <div style={{ marginTop: 12 }}>
                    <Notice
                        status={actionResult.error ? 'error' : 'success'}
                        isDismissible={true}
                        onRemove={() => setActionResult(null)}
                    >
                        {actionResult.error
                            ? `Failed to ${actionResult.action === 'removed' ? 'remove' : 'update'} ${actionResult.name}: ${actionResult.error}`
                            : `${actionResult.name} ${actionResult.action}.`
                        }
                    </Notice>
                    <ComposerOutput output={actionResult.output} />
                </div>
            )}
        </div>
    );
}
