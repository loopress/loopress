import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HooksPanel } from './HooksPanel';
import type { HookFile } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapperWithFiles(files: HookFile[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['hook-files'], files);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function errorWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('HooksPanel', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders "No hook files uploaded" when the list is empty', () => {
        render(<HooksPanel />, { wrapper: wrapperWithFiles([]) });
        expect(screen.getByText(/No hook files uploaded yet/i)).toBeInTheDocument();
    });

    test('renders one row per uploaded file with its action/filter bindings', () => {
        const files: HookFile[] = [
            {
                filename: 'content-filters',
                content: '<?php',
                hooks: [
                    { type: 'action', hook: 'init', recurrence: null },
                    { type: 'filter', hook: 'the_content', recurrence: null },
                ],
            },
        ];

        render(<HooksPanel />, { wrapper: wrapperWithFiles(files) });

        expect(screen.getByText('content-filters.php')).toBeInTheDocument();
        expect(screen.getByText('action: init')).toBeInTheDocument();
        expect(screen.getByText('filter: the_content')).toBeInTheDocument();
    });

    test('renders a cron binding with its recurrence and explicit hook', () => {
        const files: HookFile[] = [
            { filename: 'cleanup', content: '<?php', hooks: [{ type: 'cron', hook: 'my_cron', recurrence: 'daily' }] },
        ];

        render(<HooksPanel />, { wrapper: wrapperWithFiles(files) });

        expect(screen.getByText('cron: daily → my_cron')).toBeInTheDocument();
    });

    test('shows "none detected" for a file with no scanned bindings', () => {
        const files: HookFile[] = [{ filename: 'plain', content: '<?php', hooks: [] }];

        render(<HooksPanel />, { wrapper: wrapperWithFiles(files) });

        expect(screen.getByText('none detected')).toBeInTheDocument();
    });

    test('shows an error notice when the fetch fails', async () => {
        apiFetchMock.mockRejectedValue(new Error('network error'));
        render(<HooksPanel />, { wrapper: errorWrapper });
        expect(await screen.findByText('Failed to load hooks.')).toBeInTheDocument();
    });

    test('shows a load-failure badge and the reason for a file with an error', () => {
        const files: HookFile[] = [
            { filename: 'broken', content: '<?php', error: 'no public #[Action], #[Filter], or #[Cron] method found, nothing registered', hooks: [] },
        ];

        render(<HooksPanel />, { wrapper: wrapperWithFiles(files) });

        expect(screen.getByText('Failed to load')).toBeInTheDocument();
        expect(screen.getByText(/no public #\[Action\]/)).toBeInTheDocument();
    });
});
