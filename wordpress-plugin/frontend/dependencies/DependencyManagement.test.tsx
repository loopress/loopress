import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DependencyManagement } from './DependencyManagement';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

if (typeof window !== 'undefined') {
    (window as any).loopressData = {
        apiUrl: 'http://localhost/wp-json/loopress/v1',
        nonce: 'test-nonce',
        autoloadError: null,
        phpVersion: '8.2.29',
    };
}

function makeWrapper(installedPackages: unknown[] = []) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['installed-packages'], installedPackages);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

describe('DependencyManagement', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders the section header, search and installed packages', () => {
        render(<DependencyManagement />, { wrapper: makeWrapper() });

        expect(screen.getByText('Dependency Management')).toBeInTheDocument();
        expect(screen.getByLabelText(/search a composer package/i)).toBeInTheDocument();
        expect(screen.getByText('Installed Packages')).toBeInTheDocument();
    });

    test('shows no install notice before any install attempt', () => {
        render(<DependencyManagement />, { wrapper: makeWrapper() });

        expect(screen.queryByText(/installed successfully/i)).toBeNull();
        expect(screen.queryByText(/Failed to install/i)).toBeNull();
    });

    test('lists installed packages with their locked version', () => {
        render(<DependencyManagement />, {
            wrapper: makeWrapper([
                { name: 'guzzlehttp/guzzle', version: '7.8.1', constraint: '^7.0' },
            ]),
        });

        expect(screen.getByText('guzzlehttp/guzzle')).toBeInTheDocument();
        expect(screen.getByText('7.8.1')).toBeInTheDocument();
    });
});
