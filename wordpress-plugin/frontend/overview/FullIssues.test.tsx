import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FullIssues } from './FullIssues';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const HEALTHY: Record<string, unknown> = {
    '/apps/diagnostics': { issues: [] },
    '/composer/diagnostics': { php_version: '8.3.0', platform_php: null, issues: [] },
    '/composer/audit': { advisories: {}, abandoned: {} },
};

describe('FullIssues', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders nothing on a healthy site', async () => {
        apiFetchMock.mockImplementation(async (path: string) => HEALTHY[path] ?? []);
        const { container } = render(<FullIssues />, { wrapper });

        await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/apps/diagnostics'));
        expect(container).toBeEmptyDOMElement();
    });

    test('gathers the issues every other tab raises', async () => {
        const responses: Record<string, unknown> = {
            ...HEALTHY,
            '/apps/diagnostics': { issues: [{ code: 'nosniff', message: 'App assets are served without nosniff.' }] },
            '/api-files': [{ filename: 'broken', content: '', error: 'Parse error on line 9' }],
            '/registered-roles': [{ slug: 'client', conflict: true }],
        };
        apiFetchMock.mockImplementation(async (path: string) => responses[path] ?? []);

        render(<FullIssues />, { wrapper });

        expect(await screen.findByText('Server configuration issue')).toBeInTheDocument();
        expect(await screen.findByText('API route broken.php failed to load')).toBeInTheDocument();
        expect(await screen.findByText(/Role client: already registered/)).toBeInTheDocument();
    });
});
