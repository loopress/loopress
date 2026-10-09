import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api';
import { ConfigPanel } from './ConfigPanel';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const RESPONSES: Record<string, unknown> = {
    '/acf/field-groups': [{ key: 'group_hero', title: 'Hero' }],
    '/acf/post-types': [{ key: 'post_type_event', title: 'Events' }],
    '/acf/taxonomies': [],
    '/acf/options-pages': [],
    '/menus': [{ slug: 'main', name: 'Main menu', items: [{}, {}, {}] }],
    '/forms': [{ id: 12, settings: { form_title: 'Contact' } }],
    '/seo/redirects': [{ id: 1, sources: [{ pattern: 'old-page' }], urlTo: '/new-page', headerCode: 301 }],
};

describe('ConfigPanel', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
        apiFetchMock.mockImplementation(async (path: string) => RESPONSES[path] ?? []);
    });

    test('lists the synced configuration of each resource', async () => {
        render(<ConfigPanel />, { wrapper });

        expect(await screen.findByText('Hero')).toBeInTheDocument();
        expect(screen.getByText('Events')).toBeInTheDocument();
        expect(screen.getByText('Post type')).toBeInTheDocument();
        expect(await screen.findByText('Main menu')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(await screen.findByText('Contact')).toBeInTheDocument();
        expect(await screen.findByText('old-page')).toBeInTheDocument();
        expect(screen.getByText('lps acf pull')).toBeInTheDocument();
    });

    test("shows the endpoint's own reason when a plugin isn't active", async () => {
        apiFetchMock.mockImplementation(async (path: string) => {
            if (path.startsWith('/acf/')) throw new ApiError('ACF is not active');
            if (path === '/seo/redirects') throw new ApiError('No supported SEO plugin is active');
            return RESPONSES[path] ?? [];
        });

        render(<ConfigPanel />, { wrapper });

        expect(await screen.findByText('ACF is not active')).toBeInTheDocument();
        expect(await screen.findByText('No supported SEO plugin is active')).toBeInTheDocument();
        expect(await screen.findByText('Main menu')).toBeInTheDocument();
    });
});
