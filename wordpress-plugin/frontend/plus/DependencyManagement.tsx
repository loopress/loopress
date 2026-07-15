import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import { ComposerOutput } from './ComposerOutput';
import { PackageSearch } from './PackageSearch';
import { InstalledPackages } from './InstalledPackages';
import type { ComposerResult } from '../types';

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
            return apiFetch<ComposerResult>('/composer/require', {
                method: 'POST',
                body: JSON.stringify({ package: packageName, version }),
            });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installed-packages'] }),
    });

    return (
        <Card>
            <CardHeader><h3 style={{ margin: 0 }}>Dependency Management</h3></CardHeader>
            <CardBody>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, alignItems: 'start' }}>
                    <div style={{ paddingRight: 24, borderRight: '1px solid #f0f0f0' }}>
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
                                        ? `${installedName} installed successfully.`
                                        : `Failed to install ${installedName}: ${installErrorData?.message}`
                                    }
                                </Notice>
                                <ComposerOutput output={installData?.output ?? installErrorData?.output} />
                            </div>
                        )}
                    </div>

                    <div style={{ paddingLeft: 24 }}>
                        <InstalledPackages />
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}
