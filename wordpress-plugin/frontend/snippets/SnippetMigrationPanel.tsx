import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import { SnippetMigration } from './SnippetMigration';
import type { SnippetMigrationDirection, SnippetMigrationStatus } from '../types';

const OPTIONS: { name: SnippetMigrationDirection; label: string }[] = [
    { name: 'wpcode-to-code-snippets', label: 'WPCode → Code Snippets' },
    { name: 'code-snippets-to-wpcode', label: 'Code Snippets → WPCode' },
];

function useDirectionStatus(direction: SnippetMigrationDirection) {
    return useQuery<SnippetMigrationStatus>({
        queryKey: ['snippet-migration', direction],
        queryFn: () => apiFetch<SnippetMigrationStatus>(`/snippets/migration/${direction}`),
        staleTime: 30_000,
    });
}

export function SnippetMigrationPanel() {
    const wpcodeToCodeSnippets = useDirectionStatus('wpcode-to-code-snippets');
    const codeSnippetsToWpCode = useDirectionStatus('code-snippets-to-wpcode');

    if (wpcodeToCodeSnippets.isPending || codeSnippetsToWpCode.isPending) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner /> Loading snippets…
            </div>
        );
    }

    // Defaults to migrating from whichever plugin currently holds more snippets into the
    // one with fewer: the more likely direction of an actual consolidation, rather than
    // spreading one plugin's snippets out into the other.
    const defaultDirection: SnippetMigrationDirection =
        (codeSnippetsToWpCode.data?.snippets.length ?? 0) > (wpcodeToCodeSnippets.data?.snippets.length ?? 0)
            ? 'code-snippets-to-wpcode'
            : 'wpcode-to-code-snippets';

    return <SnippetMigrationPills defaultDirection={defaultDirection} />;
}

function SnippetMigrationPills({ defaultDirection }: { defaultDirection: SnippetMigrationDirection }) {
    const [activeDirection, setActiveDirection] = useState(defaultDirection);

    return (
        <div>
            <div role="group" aria-label="Migration direction" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {OPTIONS.map((option) => {
                    const isActive = option.name === activeDirection;
                    return (
                        <Button
                            key={option.name}
                            variant={isActive ? 'primary' : 'secondary'}
                            aria-pressed={isActive}
                            onClick={() => setActiveDirection(option.name)}
                            style={{ borderRadius: 999, paddingLeft: 16, paddingRight: 16 }}
                        >
                            {option.label}
                        </Button>
                    );
                })}
            </div>

            <SnippetMigration direction={activeDirection} />
        </div>
    );
}
