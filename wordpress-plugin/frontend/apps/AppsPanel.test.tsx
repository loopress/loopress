import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppsPanel } from './AppsPanel';
import type { RemoteApp } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapperWithApps(apps: RemoteApp[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['apps'], apps);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function errorWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const committed: RemoteApp = {
    name: 'search',
    buildId: '9f2a1c7b4e10',
    routing: 'hash',
    deployedAt: '2026-08-30T12:00:00+00:00',
    fileCount: 3,
    totalBytes: 2560,
    committed: true,
};

describe('AppsPanel', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders "No apps deployed yet" when the list is empty', () => {
        render(<AppsPanel />, { wrapper: wrapperWithApps([]) });
        expect(screen.getByText(/No apps deployed yet/i)).toBeInTheDocument();
    });

    test('renders one row per app with its build, size and shortcode', () => {
        render(<AppsPanel />, { wrapper: wrapperWithApps([committed]) });

        expect(screen.getByText('search')).toBeInTheDocument();
        expect(screen.getByText('9f2a1c7b4e10')).toBeInTheDocument();
        expect(screen.getByText('3 (2.5 KB)')).toBeInTheDocument();
        expect(screen.getByText('[loopress_app name="search"]')).toBeInTheDocument();
    });

    test('flags an app whose assets were uploaded but never committed', () => {
        const pending: RemoteApp = {
            name: 'draft',
            buildId: null,
            routing: null,
            deployedAt: null,
            fileCount: 0,
            totalBytes: 0,
            committed: false,
        };

        render(<AppsPanel />, { wrapper: wrapperWithApps([pending]) });

        expect(screen.getByText('Uploaded, not committed')).toBeInTheDocument();
    });

    test('shows an error notice when the fetch fails', async () => {
        apiFetchMock.mockRejectedValue(new Error('network error'));
        render(<AppsPanel />, { wrapper: errorWrapper });
        expect(await screen.findByText('Failed to load apps.')).toBeInTheDocument();
    });
});
