import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import { ComposerOutput } from './ComposerOutput';
import { PackageSearch } from './PackageSearch';
import type { ComposerResult } from '../types';

const { autoloadError } = window.loopressData;

export function DependencyManagement() {
    const queryClient = useQueryClient();
    const [installedName, setInstalledName] = useState('');

    const {
        mutateAsync: installPackage,
        isPending: installing,
        isSuccess: installSuccess,
        isError: installError,
        data: installData,
        error: installErrorData,
        reset: resetInstall,
    } = useMutation<ComposerResult, ApiError, { packageName: string; version: string }>({
        mutationFn: ({ packageName, version }) => {
            setInstalledName(`${packageName} v${version}`);
            return apiFetch<ComposerResult>('/vendor/require', {
                method: 'POST',
                body: JSON.stringify({ package: packageName, version }),
            });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installed-packages'] }),
    });

    const {
        mutate: repair,
        isPending: repairing,
        isSuccess: repairSuccess,
        isError: repairError,
        data: repairData,
        error: repairErrorData,
        reset: resetRepair,
    } = useMutation<ComposerResult, ApiError>({
        mutationFn: () => apiFetch<ComposerResult>('/vendor/repair', { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installed-packages'] }),
    });

    return (
        <Card style={{ maxWidth: 600 }}>
            <CardHeader><h3 style={{ margin: 0 }}>Dependency Management</h3></CardHeader>
            <CardBody>
                {autoloadError && (
                    <div style={{ marginBottom: 16 }}>
                        <Notice status="warning" isDismissible={false}>
                            {autoloadError}. Run <strong>Repair</strong> below to fix.
                        </Notice>
                    </div>
                )}
                <PackageSearch
                    onInstall={async (packageName, version) => {
                        resetInstall();
                        await installPackage({ packageName, version });
                    }}
                    disabled={installing}
                />

                {installing && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#666' }}>
                        <Spinner /> Installing <strong>{installedName}</strong>…
                    </div>
                )}

                {(installSuccess || installError) && (
                    <div style={{ marginTop: 16 }}>
                        <Notice status={installSuccess ? 'success' : 'error'} isDismissible={false}>
                            {installSuccess
                                ? `✅ ${installedName} installed successfully!`
                                : `❌ Failed to install ${installedName}: ${installErrorData?.message}`
                            }
                        </Notice>
                        <ComposerOutput output={installData?.output ?? installErrorData?.output} />
                    </div>
                )}

                <hr style={{ margin: '20px 0', borderColor: '#f0f0f0' }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <strong style={{ fontSize: 13 }}>Repair</strong>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666' }}>
                            Sync the lockfile with composer.json and reinstall missing packages.
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        isDestructive
                        disabled={repairing}
                        onClick={() => { resetRepair(); repair(); }}
                    >
                        {repairing ? <><Spinner /> Repairing…</> : 'Repair'}
                    </Button>
                </div>

                {(repairSuccess || repairError) && (
                    <div style={{ marginTop: 12 }}>
                        <Notice status={repairSuccess ? 'success' : 'error'} isDismissible={false}>
                            {repairSuccess
                                ? `✅ ${repairData?.message}`
                                : `❌ ${repairErrorData?.message}`
                            }
                        </Notice>
                        <ComposerOutput output={repairData?.output ?? repairErrorData?.output} />
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
