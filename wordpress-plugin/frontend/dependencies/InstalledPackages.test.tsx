import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstalledPackages } from './InstalledPackages';
import type { Package, OutdatedPackage } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapperWithPackages(packages: Package[], outdated: OutdatedPackage[] = []) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['installed-packages'], packages);
    client.setQueryData(['outdated-packages'], outdated);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function emptyWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    client.setQueryData(['installed-packages'], [] as Package[]);
    client.setQueryData(['outdated-packages'], [] as OutdatedPackage[]);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('InstalledPackages', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders "No packages installed" when list is empty', () => {
        render(<InstalledPackages />, { wrapper: emptyWrapper });
        expect(screen.getByText(/No packages installed yet/i)).toBeInTheDocument();
    });

    test('renders package names and versions', () => {
        const packages: Package[] = [
            { name: 'guzzlehttp/guzzle', version: '^7.0' },
            { name: 'symfony/http-client', version: '^6.4' },
        ];

        render(<InstalledPackages />, { wrapper: wrapperWithPackages(packages) });
        expect(screen.getByText('guzzlehttp/guzzle')).toBeInTheDocument();
        expect(screen.getByText('^7.0')).toBeInTheDocument();
        expect(screen.getByText('symfony/http-client')).toBeInTheDocument();
        expect(screen.getByText('^6.4')).toBeInTheDocument();
    });

    test('renders a remove button for each package', () => {
        const packages: Package[] = [
            { name: 'guzzlehttp/guzzle', version: '^7.0' },
            { name: 'monolog/monolog', version: '^3.0' },
        ];

        render(<InstalledPackages />, { wrapper: wrapperWithPackages(packages) });
        const removeButtons = screen.getAllByRole('button', { name: /Remove/i });
        expect(removeButtons).toHaveLength(2);
    });

    test('renders table headers', () => {
        const packages: Package[] = [{ name: 'guzzlehttp/guzzle', version: '^7.0' }];
        render(<InstalledPackages />, { wrapper: wrapperWithPackages(packages) });
        expect(screen.getByText('Package')).toBeInTheDocument();
        expect(screen.getByText('Version')).toBeInTheDocument();
    });

    test('renders the installed packages card heading', () => {
        render(<InstalledPackages />, { wrapper: emptyWrapper });
        expect(screen.getByText('Installed Packages')).toBeInTheDocument();
    });

    test('shows an update badge and button for outdated packages', () => {
        const packages: Package[] = [
            { name: 'guzzlehttp/guzzle', version: '7.8.0' },
            { name: 'monolog/monolog', version: '3.0.0' },
        ];
        const outdated: OutdatedPackage[] = [
            { name: 'guzzlehttp/guzzle', version: '7.8.0', latest: '7.9.0' },
        ];

        render(<InstalledPackages />, { wrapper: wrapperWithPackages(packages, outdated) });
        expect(screen.getByText('update: 7.9.0')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Update' })).toHaveLength(1);
    });

    test('does not show an update badge or button when everything is current', () => {
        const packages: Package[] = [{ name: 'guzzlehttp/guzzle', version: '7.8.0' }];

        render(<InstalledPackages />, { wrapper: wrapperWithPackages(packages, []) });
        expect(screen.queryByText(/update:/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    });

    test('triggers the update flow when the Update button is clicked', async () => {
        const packages: Package[] = [{ name: 'guzzlehttp/guzzle', version: '7.8.0' }];
        const outdated: OutdatedPackage[] = [
            { name: 'guzzlehttp/guzzle', version: '7.8.0', latest: '7.9.0' },
        ];

        apiFetchMock.mockImplementation(async (path: string) => {
            if (path === '/composer/require') {
                return { message: 'Updated.', output: 'Package updated.' };
            }
            if (path === '/composer/installed') {
                return packages;
            }
            if (path === '/composer/outdated') {
                return outdated;
            }
            return {};
        });

        const user = userEvent.setup();

        render(<InstalledPackages />, { wrapper: wrapperWithPackages(packages, outdated) });
        await user.click(screen.getByRole('button', { name: 'Update' }));

        expect(await screen.findByText(/guzzlehttp\/guzzle updated/i)).toBeInTheDocument();
        expect(apiFetchMock).toHaveBeenCalledWith('/composer/require', {
            method: 'POST',
            body: JSON.stringify({ package: 'guzzlehttp/guzzle', version: '7.9.0' }),
        });
    });
});
