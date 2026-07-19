import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function stubQuietEndpoints() {
    apiFetchMock.mockImplementation(async (path: string) => {
        if (path.startsWith('/snippets/migration/')) {
            return { sourceActive: false, destinationActive: false, snippets: [] };
        }
        return {};
    });
}

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
        apiFetchMock.mockReset();
        stubQuietEndpoints();
    });

    test('renders the Loopress Light heading with the plugin version', async () => {
        await renderApp();

        expect(screen.getByRole('heading', { name: 'Loopress Light' })).toBeInTheDocument();
        expect(screen.getByText('v2026.7.0')).toBeInTheDocument();
    });

    test('points the user at the CLI pairing flow', async () => {
        await renderApp();

        expect(screen.getByText(/lps snippet pull/i)).toBeInTheDocument();
    });

    test('renders the snippet migration section', async () => {
        apiFetchMock.mockImplementation(async (path: string) => {
            if (path === '/snippets/migration/wpcode-to-code-snippets') {
                return {
                    sourceActive: true,
                    destinationActive: true,
                    snippets: [{
                        id: 1,
                        name: 'Tracking script',
                        code: '',
                        type: 'js',
                        active: true,
                        description: '',
                        location: 'header',
                        insertMethod: 'auto',
                        priority: 10,
                        shortcodeAttributes: [],
                        tags: [],
                    }],
                };
            }
            if (path.startsWith('/snippets/migration/')) {
                return { sourceActive: false, destinationActive: false, snippets: [] };
            }
            return {};
        });

        await renderApp();

        expect(await screen.findByText('Migrate WPCode → Code Snippets')).toBeInTheDocument();
        expect(await screen.findByText('Tracking script')).toBeInTheDocument();
    });
});
