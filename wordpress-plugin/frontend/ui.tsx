import { useState } from 'react';
import { Button, Notice, Spinner } from '@wordpress/components';
import { MUTED } from './helpers';

// Shared building blocks for every panel, kept outside frontend/dependencies/ so the Light
// bundle can import them without pulling in any Composer UI. Plain values and functions live
// in helpers.ts (fast refresh wants component-only modules).

const PULSE = '@keyframes lp-pulse{0%,100%{opacity:1}50%{opacity:.4}}';

const PILL_TONES = {
    neutral: { color: '#1e1e1e', background: '#f0f0f1' },
    warning: { color: '#92400e', background: '#fef3c7' },
    error: { color: '#991b1b', background: '#fee2e2' },
    danger: { color: '#fff', background: '#b91c1c' },
};

export function Pill({ tone = 'neutral', title, children }: Readonly<{
    tone?: keyof typeof PILL_TONES;
    title?: string;
    children: React.ReactNode;
}>) {
    return (
        <span
            title={title}
            style={{
                ...PILL_TONES[tone],
                marginLeft: 8, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                borderRadius: 12, padding: '2px 8px', whiteSpace: 'nowrap',
            }}
        >
            {children}
        </span>
    );
}

export function Skeleton({ rows = 3 }: Readonly<{ rows?: number }>) {
    return (
        <>
            <style>{PULSE}</style>
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={i}
                    data-testid="skeleton"
                    style={{
                        height: 12, width: 220, background: '#e0e0e0', borderRadius: 4, margin: '8px 0',
                        animation: `lp-pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
                    }}
                />
            ))}
        </>
    );
}

// Header, loading, error and empty states shared by every list panel: only the table differs.
export function ResourceSection({ title, description, query, isEmpty, empty, errorText, children }: Readonly<{
    title: string;
    description?: React.ReactNode;
    query: { isPending: boolean; isFetching: boolean; isError: boolean };
    isEmpty: boolean;
    empty: React.ReactNode;
    errorText: string;
    children: React.ReactNode;
}>) {
    const { isPending, isFetching, isError } = query;

    return (
        <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 14, margin: 0 }}>{title}</h2>
                {isFetching && !isPending && <Spinner />}
            </div>
            {description && <p style={{ color: MUTED, fontSize: 13, margin: '4px 0 12px' }}>{description}</p>}

            {isError && <Notice status="error" isDismissible={false}>{errorText}</Notice>}
            {isPending && <Skeleton />}
            {!isPending && !isError && isEmpty && <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>{empty}</p>}
            {!isEmpty && children}
        </section>
    );
}

export function Table({ columns, children }: Readonly<{ columns: string[]; children: React.ReactNode }>) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
                <tr style={{ borderBottom: '2px solid #dcdcde', textAlign: 'left' }}>
                    {columns.map((column) => (
                        <th key={column} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{column}</th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    );
}

export function Row({ children }: Readonly<{ children: React.ReactNode }>) {
    return <tr style={{ borderBottom: '1px solid #f0f0f1' }}>{children}</tr>;
}

export function CopyButton({ text, label = 'Copy' }: Readonly<{ text: string; label?: string }>) {
    const [copied, setCopied] = useState(false);

    return (
        <Button
            variant="tertiary"
            size="small"
            aria-label={`${label}: ${text}`}
            onClick={() => {
                navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                });
            }}
        >
            {copied ? 'Copied' : label}
        </Button>
    );
}

