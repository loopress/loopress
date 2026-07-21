import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UpdateNotice } from './UpdateNotice';
import type { UpdateStatus } from '../types';

function wrapperWithData(data: UpdateStatus) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['update-status'], data);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function loadingWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('UpdateNotice', () => {
    test('renders nothing while loading', () => {
        const { container } = render(<UpdateNotice />, { wrapper: loadingWrapper });
        expect(container).toBeEmptyDOMElement();
    });

    test('renders nothing when already on the latest version', () => {
        const data: UpdateStatus = {
            current_version: '2026.7.9',
            latest_version: '2026.7.9',
            update_available: false,
            release_url: null,
        };
        const { container } = render(<UpdateNotice />, { wrapper: wrapperWithData(data) });
        expect(container).toBeEmptyDOMElement();
    });

    test('shows the new version and a link to the release when an update is available', () => {
        const data: UpdateStatus = {
            current_version: '2026.7.6',
            latest_version: '2026.7.9',
            update_available: true,
            release_url: 'https://github.com/loopress/loopress/releases/tag/wordpress-plugin%402026.7.9',
        };
        render(<UpdateNotice />, { wrapper: wrapperWithData(data) });

        expect(screen.getByText(/Loopress Full 2026\.7\.9 is available/i)).toBeInTheDocument();
        expect(screen.getByText(/You are running 2026\.7\.6/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /View release/i })).toHaveAttribute(
            'href',
            'https://github.com/loopress/loopress/releases/tag/wordpress-plugin%402026.7.9',
        );
    });

    test('omits the release link when none is provided', () => {
        const data: UpdateStatus = {
            current_version: '2026.7.6',
            latest_version: '2026.7.9',
            update_available: true,
            release_url: null,
        };
        render(<UpdateNotice />, { wrapper: wrapperWithData(data) });

        expect(screen.queryByRole('link', { name: /View release/i })).not.toBeInTheDocument();
    });
});
