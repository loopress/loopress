import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import { NoticeSkeleton } from './Skeleton';
import type { AuditResult } from '../types';

export function AuditBanner() {
    const { data, isError } = useQuery<AuditResult>({
        queryKey: ['audit'],
        queryFn: () => apiFetch<AuditResult>('/composer/audit'),
        staleTime: 5 * 60_000,
    });

    if (isError) return null;
    if (!data) return <NoticeSkeleton />;

    const advisoryEntries = Object.entries(data.advisories);
    const abandonedEntries = Object.entries(data.abandoned);

    if (advisoryEntries.length === 0 && abandonedEntries.length === 0) {
        return (
            <div style={{ maxWidth: 600, marginBottom: 20 }}>
                <Notice status="success" isDismissible={false}>
                    No security advisories or abandoned packages detected.
                </Notice>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 600, marginBottom: 20 }}>
            {advisoryEntries.map(([packageName, advisories]) =>
                advisories.map((advisory) => (
                    <Notice key={advisory.advisoryId} status="error" isDismissible={false}>
                        <strong>Security advisory: {packageName}</strong>
                        {advisory.cve && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: '#cc1818', fontWeight: 600 }}>
                                {advisory.cve}
                            </span>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: 13 }}>{advisory.title}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                            Affects: <code>{advisory.affectedVersions}</code>
                            {' · '}
                            <a href={advisory.link} target="_blank" rel="noopener noreferrer">
                                More details ↗
                            </a>
                        </p>
                    </Notice>
                ))
            )}

            {abandonedEntries.map(([packageName, replacement]) => (
                <Notice key={packageName} status="warning" isDismissible={false}>
                    <strong>Abandoned package: {packageName}</strong>
                    {replacement && (
                        <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                            Suggested replacement: <code>{replacement}</code>
                        </p>
                    )}
                </Notice>
            ))}
        </div>
    );
}
