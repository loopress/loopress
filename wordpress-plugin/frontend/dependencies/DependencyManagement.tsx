import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import { confirmChange, MUTED } from '../helpers';
import { AuditBanner } from './AuditBanner';
import { ComposerOutput } from './ComposerOutput';
import { DiagnosticsBanner } from './DiagnosticsBanner';
import { PackageSearch } from './PackageSearch';
import { InstalledPackages } from './InstalledPackages';
import type { ComposerResult } from '../types';

export function DependencyManagement() {
    const queryClient = useQueryClient();
    const [installedName, setInstalledName] = useState('');
    // DISALLOW_FILE_MODS: the server refuses every Composer change, so don't offer any.
    const readOnly = window.loopressData?.fileModsAllowed === false;

    const {
        mutate: installPackage,
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
        <>
            <DiagnosticsBanner />
            <AuditBanner />

            {readOnly && (
                <div style={{ marginBottom: 20 }}>
                    <Notice status="info" isDismissible={false}>
                        File modifications are disabled on this site (<code>DISALLOW_FILE_MODS</code>), so dependencies
                        are read-only here. Change them in your repository and deploy.
                    </Notice>
                </div>
            )}

            <Card>
                <CardHeader><h2 style={{ margin: 0, fontSize: 14 }}>Composer dependencies</h2></CardHeader>
                <CardBody>
                    <p style={{ color: MUTED, fontSize: 13, marginTop: 0 }}>
                        Changes made here edit this site&apos;s composer.json. Run <code>lps composer pull</code> afterwards
                        to bring them back into your repository.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32, alignItems: 'start' }}>
                        {!readOnly && (
                            <div>
                                <PackageSearch
                                    onInstall={async (packageName, version) => {
                                        if (!confirmChange(`Install ${packageName} ${version}?`)) return;
                                        resetInstall();
                                        // `mutate`, not `mutateAsync`: errors are reported through the
                                        // mutation's own isError/error state below, so nothing here
                                        // needs to await or catch a rejection.
                                        installPackage({ packageName, version });
                                    }}
                                    disabled={installing}
                                />

                                {installing && (
                                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: MUTED }}>
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
                        )}

                        <InstalledPackages readOnly={readOnly} />
                    </div>
                </CardBody>
            </Card>
        </>
    );
}
