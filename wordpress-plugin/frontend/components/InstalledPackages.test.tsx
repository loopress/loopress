import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstalledPackages } from './InstalledPackages';
import type { Package } from '../types';

function wrapperWithPackages(packages: Package[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['installed-packages'], packages);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function emptyWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    client.setQueryData(['installed-packages'], [] as Package[]);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('InstalledPackages', () => {
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
});
