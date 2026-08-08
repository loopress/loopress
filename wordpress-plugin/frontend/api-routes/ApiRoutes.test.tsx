import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRoutes } from './ApiRoutes';
import type { ApiFile } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapperWithFiles(files: ApiFile[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['api-files'], files);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function errorWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ApiRoutes', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders "No API route files uploaded" when the list is empty', () => {
        render(<ApiRoutes />, { wrapper: wrapperWithFiles([]) });
        expect(screen.getByText(/No API route files uploaded yet/i)).toBeInTheDocument();
    });

    test('renders one row per uploaded file with its derived route', () => {
        const files: ApiFile[] = [
            { filename: 'hello-world', content: '<?php' },
            { filename: 'webhook-handler', content: '<?php' },
        ];

        render(<ApiRoutes />, { wrapper: wrapperWithFiles(files) });

        expect(screen.getByText('hello-world.php')).toBeInTheDocument();
        expect(screen.getByText('loopress-api/v1/hello-world')).toBeInTheDocument();
        expect(screen.getByText('webhook-handler.php')).toBeInTheDocument();
        expect(screen.getByText('loopress-api/v1/webhook-handler')).toBeInTheDocument();
    });

    test('shows an error notice when the fetch fails', async () => {
        apiFetchMock.mockRejectedValue(new Error('network error'));
        render(<ApiRoutes />, { wrapper: errorWrapper });
        expect(await screen.findByText('Failed to load API routes.')).toBeInTheDocument();
    });

    test('shows a load-failure badge and the reason for a file with an error', () => {
        const files: ApiFile[] = [
            { filename: 'broken', content: '<?php', error: 'expected exactly one class declaration, found none' },
        ];

        render(<ApiRoutes />, { wrapper: wrapperWithFiles(files) });

        expect(screen.getByText('Failed to load')).toBeInTheDocument();
        expect(screen.getByText('expected exactly one class declaration, found none')).toBeInTheDocument();
    });

    test('shows no badge for a file that loaded cleanly', () => {
        const files: ApiFile[] = [{ filename: 'hello-world', content: '<?php' }];

        render(<ApiRoutes />, { wrapper: wrapperWithFiles(files) });

        expect(screen.queryByText('Failed to load')).not.toBeInTheDocument();
    });
});
