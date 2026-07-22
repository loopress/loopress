import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderApp() {
    window.loopressData = {
        apiUrl: 'http://localhost/wp-json/loopress/v1',
        nonce: 'test-nonce',
        autoloadError: null,
        phpVersion: '8.2.29',
        pluginVersion: '2026.7.0',
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

    test('renders the Loopress Light heading with the plugin version', async () => {
        await renderApp();

        expect(screen.getByRole('heading', { name: 'Loopress Light' })).toBeInTheDocument();
        expect(screen.getByText('v2026.7.0')).toBeInTheDocument();
    });

    test('points the user at the CLI pairing flow', async () => {
        await renderApp();

        expect(screen.getByText(/lps acf pull/i)).toBeInTheDocument();
        expect(screen.getByText(/lps seo pull/i)).toBeInTheDocument();
    });
});
