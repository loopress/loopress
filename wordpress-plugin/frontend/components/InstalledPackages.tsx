import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import { ComposerOutput } from './ComposerOutput';
import type { Package, ComposerResult } from '../types';

interface RemoveState {
    name: string;
    output?: string | null;
    error: string | null;
}

export function InstalledPackages() {
    const queryClient = useQueryClient();
    const [removingOutput, setRemovingOutput] = useState<RemoveState | null>(null);

    const { data: packages = [], isFetching, isError } = useQuery<Package[]>({
        queryKey: ['installed-packages'],
        queryFn: () => apiFetch<Package[]>('/vendor/installed'),
        staleTime: 30_000,
    });

    const { mutate: removePackage, isPending: removing, variables: removingPkg } = useMutation<ComposerResult, ApiError, string>({
        mutationFn: (packageName) => apiFetch<ComposerResult>('/vendor/remove', {
            method: 'POST',
            body: JSON.stringify({ package: packageName }),
        }),
        onSuccess: (data, packageName) => {
            setRemovingOutput({ name: packageName, output: data?.output, error: null });
            queryClient.invalidateQueries({ queryKey: ['installed-packages'] });
        },
        onError: (err, packageName) => {
            setRemovingOutput({ name: packageName, output: err.output, error: err.message });
        },
    });

    return (
        <Card style={{ maxWidth: 600 }}>
            <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <h3 style={{ margin: 0 }}>Installed Packages</h3>
                    {isFetching && <Spinner />}
                </div>
            </CardHeader>
            <CardBody>
                {isError && (
                    <Notice status="error" isDismissible={false}>
                        Failed to load installed packages.
                    </Notice>
                )}
                {!isFetching && !isError && packages.length === 0 && (
                    <p style={{ color: '#666', fontSize: 13, margin: 0 }}>No packages installed yet.</p>
                )}
                {packages.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                                <th style={{ padding: '6px 8px' }}>Package</th>
                                <th style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>Version</th>
                                <th style={{ padding: '6px 8px' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {packages.map((pkg) => (
                                <tr key={pkg.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '8px' }}>
                                        <strong>{pkg.name}</strong>
                                    </td>
                                    <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#1d4ed8' }}>
                                        {pkg.version}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                        <Button
                                            variant="tertiary"
                                            isDestructive
                                            size="small"
                                            disabled={removing && removingPkg === pkg.name}
                                            onClick={() => removePackage(pkg.name)}
                                        >
                                            {removing && removingPkg === pkg.name ? <Spinner /> : 'Remove'}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {removingOutput && (
                    <div style={{ marginTop: 12 }}>
                        <Notice
                            status={removingOutput.error ? 'error' : 'success'}
                            isDismissible={true}
                            onRemove={() => setRemovingOutput(null)}
                        >
                            {removingOutput.error
                                ? `❌ Failed to remove ${removingOutput.name}: ${removingOutput.error}`
                                : `✅ ${removingOutput.name} removed.`
                            }
                        </Notice>
                        <ComposerOutput output={removingOutput.output} />
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
