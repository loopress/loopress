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
    '/registered-post-types': [
        { slug: 'post', label: 'Posts', source: 'wordpress', count: 4, managed: false, conflict: false },
        { slug: 'book', label: 'Books', source: 'cptui', count: 2, managed: true, conflict: true },
    ],
    '/registered-taxonomies': [
        { slug: 'genre', label: 'Genres', source: 'loopress', count: 7, objectTypes: ['book', 'post'], managed: true, conflict: false },
    ],
    '/registered-post-meta': [
        { postType: 'book', key: 'isbn', type: 'string', showInRest: true, source: 'loopress', acf: true, conflict: false },
    ],
    '/forms': [{ id: 12, settings: { form_title: 'Contact' } }],
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
        expect(screen.getByRole('cell', { name: 'Post type' })).toBeInTheDocument();
        expect(await screen.findByText('Main menu')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(await screen.findByText('Contact')).toBeInTheDocument();
        expect(screen.getByText('lps acf pull')).toBeInTheDocument();
    });

    test('lists every post type with its source and flags a Loopress one skipped for a conflict', async () => {
        render(<ConfigPanel />, { wrapper });

        expect(await screen.findByText('Books')).toBeInTheDocument();
        expect(screen.getByText('CPT UI')).toBeInTheDocument();
        expect(screen.getByText('WordPress')).toBeInTheDocument();
        expect(screen.getAllByText('Conflict')).toHaveLength(1);
    });

    test('lists every taxonomy with its source and the post types it attaches to', async () => {
        render(<ConfigPanel />, { wrapper });

        expect(await screen.findByText('Genres')).toBeInTheDocument();
        expect(screen.getByText('book, post')).toBeInTheDocument();
        expect(screen.getByText('lps taxonomy pull')).toBeInTheDocument();
    });

    test('lists the registered meta keys, an ACF field of the same name flagged for information', async () => {
        render(<ConfigPanel />, { wrapper });

        expect(await screen.findByText('isbn')).toBeInTheDocument();
        expect(screen.getByText('ACF field')).toBeInTheDocument();
        expect(screen.getByText('lps meta pull')).toBeInTheDocument();
    });

    test("shows the endpoint's own reason when a plugin isn't active", async () => {
        apiFetchMock.mockImplementation(async (path: string) => {
            if (path.startsWith('/acf/')) throw new ApiError('ACF is not active');
            if (path === '/forms') throw new ApiError('WPForms is not active');
            return RESPONSES[path] ?? [];
        });

        render(<ConfigPanel />, { wrapper });

        expect(await screen.findByText('ACF is not active')).toBeInTheDocument();
        expect(await screen.findByText('WPForms is not active')).toBeInTheDocument();
        expect(await screen.findByText('Main menu')).toBeInTheDocument();
    });
});
