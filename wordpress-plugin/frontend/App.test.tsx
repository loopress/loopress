import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function stubQuietEndpoints() {
    apiFetchMock.mockImplementation(async (path: string) => {
        if (path === '/composer/diagnostics') {
            return { php_version: '8.2.29', platform_php: '8.2.29', issues: [] };
        }
        if (path === '/composer/audit') {
            return { advisories: {}, abandoned: {} };
        }
        if (path === '/composer/installed') {
            return [];
        }
        if (path === '/composer/outdated') {
            return [];
        }
        return {};
    });
}

function renderApp(autoloadError: string | null) {
    (window as any).loopressData = {
        apiUrl: 'http://localhost/wp-json/loopress/v1',
        nonce: 'test-nonce',
        autoloadError,
        phpVersion: '8.2.29',
        pluginVersion: '2026.7.0',
    };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // App reads window.loopressData at module scope, so it must be imported
    // after loopressData is set; resetModules makes each render independent.
    return import('./App').then(({ default: App }) =>
        render(
            <QueryClientProvider client={client}>
                <App />
            </QueryClientProvider>,
        ),
    );
}

describe('App', () => {
    beforeEach(() => {
        vi.resetModules();
        apiFetchMock.mockReset();
        stubQuietEndpoints();
    });

    test('renders the Loopress heading without a repair notice when the autoload is healthy', async () => {
        await renderApp(null);

        expect(screen.getByRole('heading', { name: 'Loopress' })).toBeInTheDocument();
        expect(screen.getByText('v2026.7.0')).toBeInTheDocument();
        expect(screen.queryByText(/Repairing dependencies/i)).toBeNull();
        expect(apiFetchMock).not.toHaveBeenCalledWith('/composer/repair', expect.anything());
    });

    test('triggers the auto-repair flow when the autoload is broken', async () => {
        await renderApp('vendor/autoload.php is corrupted');

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/composer/repair', { method: 'POST' });
        });

        await waitFor(() => {
            expect(screen.getByText(/Dependencies repaired successfully/i)).toBeInTheDocument();
        });
    });

    test('reports a failed auto-repair', async () => {
        apiFetchMock.mockImplementation(async (path: string) => {
            if (path === '/composer/repair') {
                throw new Error('composer install failed');
            }
            if (path === '/composer/diagnostics') {
                return { php_version: '8.2.29', platform_php: '8.2.29', issues: [] };
            }
            if (path === '/composer/audit') {
                return { advisories: {}, abandoned: {} };
            }
            return [];
        });

        await renderApp('vendor/autoload.php is corrupted');

        await waitFor(() => {
            expect(screen.getByText(/Auto-repair failed: vendor\/autoload.php is corrupted/i)).toBeInTheDocument();
        });
    });
});
