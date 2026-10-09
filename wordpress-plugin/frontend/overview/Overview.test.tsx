import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Overview } from './Overview';
import type { PushSummary } from '../types';

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: vi.fn() };
});

function wrapperWith(summary: PushSummary) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['pushes'], summary);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

const acfPush = { resource: 'acf:push', label: 'ACF', at: '2026-10-09T09:00:00+00:00', user: 'Site Admin', appPassword: 'CI' };

describe('Overview', () => {
    beforeEach(() => {
        window.loopressData = { ...window.loopressData, siteUrl: 'https://example.test' };
    });

    test('shows how to connect the CLI, with this site URL, before the first push', () => {
        render(<Overview />, { wrapper: wrapperWith({ entries: [], resources: [] }) });

        expect(screen.getByText('Connect your repository')).toBeInTheDocument();
        expect(screen.getByText(/lps project config/, { selector: 'pre' })).toBeInTheDocument();
        expect(screen.getByText('https://example.test')).toBeInTheDocument();
    });

    test('lists each pushed resource with who pushed it and its sync status', () => {
        render(<Overview />, {
            wrapper: wrapperWith({
                entries: [acfPush],
                resources: [
                    { resource: 'acf:push', label: 'ACF', command: 'lps acf push', lastPush: acfPush, drift: false },
                    { resource: 'option:push', label: 'Options', command: 'lps option push', lastPush: { ...acfPush, resource: 'option:push', label: 'Options', appPassword: null }, drift: null },
                ],
            }),
        });

        expect(screen.getByText('lps acf push')).toBeInTheDocument();
        expect(screen.getAllByText('by Site Admin (CI)').length).toBeGreaterThan(0);
        expect(screen.getByText('In sync')).toBeInTheDocument();
        expect(screen.getByText('Not tracked')).toBeInTheDocument();
        expect(screen.queryByText(/changed on this site since the last push/)).toBeNull();
    });

    test('warns about resources changed outside the CLI since their last push', () => {
        render(<Overview />, {
            wrapper: wrapperWith({
                entries: [acfPush],
                resources: [{ resource: 'acf:push', label: 'ACF', command: 'lps acf push', lastPush: acfPush, drift: true }],
            }),
        });

        expect(screen.getByText('Changed since')).toBeInTheDocument();
        expect(screen.getByText(/ACF changed on this site since the last push/)).toBeInTheDocument();
    });
});
