import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnippetMigrationPanel } from './SnippetMigrationPanel';
import type { Snippet } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function makeSnippets(count: number): Snippet[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Snippet ${i + 1}`,
        code: '',
        type: 'php',
        active: false,
        description: '',
        location: 'everywhere',
        insertMethod: 'auto',
        priority: 10,
        shortcodeAttributes: [],
        tags: [],
    }));
}

function wrapperWithCounts(wpcodeCount: number, codeSnippetsCount: number) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['snippet-migration', 'wpcode-to-code-snippets'], {
        sourceActive: true,
        destinationActive: true,
        snippets: makeSnippets(wpcodeCount),
    });
    client.setQueryData(['snippet-migration', 'code-snippets-to-wpcode'], {
        sourceActive: true,
        destinationActive: true,
        snippets: makeSnippets(codeSnippetsCount),
    });
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

describe('SnippetMigrationPanel', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('shows a loading state while both directions are still loading', () => {
        apiFetchMock.mockImplementation(() => new Promise(() => {}));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

        render(<SnippetMigrationPanel />, {
            wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
        });

        expect(screen.getByText('Loading snippets…')).toBeInTheDocument();
    });

    test('defaults to WPCode to Code Snippets when WPCode has more snippets', async () => {
        render(<SnippetMigrationPanel />, { wrapper: wrapperWithCounts(5, 2) });

        expect(await screen.findByRole('heading', { name: 'Migrate WPCode → Code Snippets' })).toBeInTheDocument();
    });

    test('defaults to Code Snippets to WPCode when Code Snippets has more snippets', async () => {
        render(<SnippetMigrationPanel />, { wrapper: wrapperWithCounts(2, 5) });

        expect(await screen.findByRole('heading', { name: 'Migrate Code Snippets → WPCode' })).toBeInTheDocument();
    });

    test('defaults to WPCode to Code Snippets when both counts are equal', async () => {
        render(<SnippetMigrationPanel />, { wrapper: wrapperWithCounts(3, 3) });

        expect(await screen.findByRole('heading', { name: 'Migrate WPCode → Code Snippets' })).toBeInTheDocument();
    });

    test('switches direction on click of the other pill', async () => {
        const user = userEvent.setup();
        render(<SnippetMigrationPanel />, { wrapper: wrapperWithCounts(0, 0) });
        await screen.findByRole('heading', { name: 'Migrate WPCode → Code Snippets' });

        await user.click(screen.getByRole('button', { name: 'Code Snippets → WPCode' }));

        expect(screen.getByRole('heading', { name: 'Migrate Code Snippets → WPCode' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Migrate WPCode → Code Snippets' })).toBeNull();
    });

    test('marks the active pill with aria-pressed', async () => {
        const user = userEvent.setup();
        render(<SnippetMigrationPanel />, { wrapper: wrapperWithCounts(0, 0) });
        await screen.findByRole('heading', { name: 'Migrate WPCode → Code Snippets' });

        const wpcodeButton = screen.getByRole('button', { name: 'WPCode → Code Snippets' });
        const codeSnippetsButton = screen.getByRole('button', { name: 'Code Snippets → WPCode' });

        expect(wpcodeButton).toHaveAttribute('aria-pressed', 'true');
        expect(codeSnippetsButton).toHaveAttribute('aria-pressed', 'false');

        await user.click(codeSnippetsButton);

        expect(wpcodeButton).toHaveAttribute('aria-pressed', 'false');
        expect(codeSnippetsButton).toHaveAttribute('aria-pressed', 'true');
    });
});
