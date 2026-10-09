import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('./api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./api')>();
    return { ...actual, apiFetch: vi.fn().mockResolvedValue({ entries: [], resources: [] }) };
});

function renderApp() {
    window.loopressData = {
        apiUrl: 'http://localhost/wp-json/loopress/v1',
        nonce: 'test-nonce',
        autoloadError: null,
        phpVersion: '8.2.29',
        pluginVersion: '2026.7.0',
        environment: 'staging',
        restUrl: 'http://localhost/wp-json/',
        siteUrl: 'http://localhost',
    };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // LightApp reads window.loopressData at module scope, so it must be imported
    // after loopressData is set; resetModules makes each render independent.
    return import('./LightApp').then(({ default: LightApp }) =>
        render(
            <QueryClientProvider client={client}>
                <LightApp />
            </QueryClientProvider>,
        ),
    );
}

describe('LightApp', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test('renders the Loopress heading with the edition, version and environment', async () => {
        await renderApp();

        expect(screen.getByRole('heading', { name: 'Loopress' })).toBeInTheDocument();
        expect(screen.getByText('Light v2026.7.0')).toBeInTheDocument();
        expect(screen.getByText('Staging')).toBeInTheDocument();
    });

    test('points the user at the CLI pairing flow', async () => {
        await renderApp();

        expect(await screen.findByText('Connect your repository')).toBeInTheDocument();
        expect(screen.getByText(/lps project config/, { selector: 'pre' })).toBeInTheDocument();
    });
});
