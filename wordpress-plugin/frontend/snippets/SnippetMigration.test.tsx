import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnippetMigration } from './SnippetMigration';
import type { Snippet, SnippetMigrationDirection, SnippetMigrationStatus } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

const snippets: Snippet[] = [
    {
        id: 1,
        name: 'Tracking script',
        code: '<script></script>',
        type: 'js',
        active: true,
        description: '',
        location: 'header',
        insertMethod: 'auto',
        priority: 10,
        shortcodeAttributes: [],
        tags: [],
    },
    {
        id: 2,
        name: 'Utility shortcode',
        code: '<?php',
        type: 'php',
        active: false,
        description: '',
        location: 'everywhere',
        insertMethod: 'auto',
        priority: 10,
        shortcodeAttributes: [],
        tags: [],
    },
];

const DIRECTION: SnippetMigrationDirection = 'wpcode-to-code-snippets';
const PATH = '/snippets/migration/wpcode-to-code-snippets';

function wrapperWithStatus(status: SnippetMigrationStatus, direction: SnippetMigrationDirection = DIRECTION) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['snippet-migration', direction], status);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

describe('SnippetMigration', () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
    });

    test('renders a warning and disables the flow when the destination plugin is not active', () => {
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: false, snippets }),
        });

        expect(screen.getByText(/Install and activate the Code Snippets plugin/i)).toBeInTheDocument();
        screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeDisabled());
    });

    test('renders a message when there are no WPCode snippets to migrate', () => {
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets: [] }),
        });

        expect(screen.getByText('No WPCode snippets to migrate.')).toBeInTheDocument();
    });

    test('keeps a space between the interpolated source name and the following word in the intro copy', () => {
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets: [] }),
        });

        expect(screen.getByText(/the WPCode original is deactivated/)).toBeInTheDocument();
    });

    test('renders a checkbox and row per snippet', () => {
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets }),
        });

        expect(screen.getByText('Tracking script')).toBeInTheDocument();
        expect(screen.getByText('Utility shortcode')).toBeInTheDocument();
        // one select-all checkbox + one per row
        expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    });

    test('migrate button is disabled until at least one snippet is selected', async () => {
        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets }),
        });

        const button = screen.getByRole('button', { name: /Migrate Selected/i });
        expect(button).toBeDisabled();

        const [, firstRowCheckbox] = screen.getAllByRole('checkbox');
        await user.click(firstRowCheckbox);

        expect(button).not.toBeDisabled();
    });

    test('select-all checkbox selects every row and enables the button', async () => {
        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets }),
        });

        const [selectAll] = screen.getAllByRole('checkbox');
        await user.click(selectAll);

        expect(screen.getByRole('button', { name: 'Migrate Selected (2)' })).not.toBeDisabled();
    });

    test('submits only the selected ids on migrate', async () => {
        apiFetchMock.mockImplementation(async (path: string) => {
            if (path === PATH) {
                return [{ id: 1, status: 'migrated' }];
            }
            return {};
        });

        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets }),
        });

        const [, firstRowCheckbox] = screen.getAllByRole('checkbox');
        await user.click(firstRowCheckbox);
        await user.click(screen.getByRole('button', { name: /Migrate Selected/i }));

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith(PATH, {
                method: 'POST',
                body: JSON.stringify({ ids: [1] }),
            });
        });
    });

    test('shows a migrated pill and an error pill with the message after a mixed-result migration', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (path === PATH && options?.method === 'POST') {
                return [
                    { id: 1, status: 'migrated' },
                    { id: 2, status: 'error', error: 'Snippet not found.' },
                ];
            }
            if (path === PATH) {
                return { sourceActive: true, destinationActive: true, snippets };
            }
            return {};
        });

        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets }),
        });

        const [selectAll] = screen.getAllByRole('checkbox');
        await user.click(selectAll);
        await user.click(screen.getByRole('button', { name: /Migrate Selected/i }));

        expect(await screen.findByText('Migrated')).toBeInTheDocument();
        expect(await screen.findByText('Failed: Snippet not found.')).toBeInTheDocument();
        expect(screen.getByText('1 migrated, 1 failed.')).toBeInTheDocument();
    });

    test('shows a warning pill when a snippet is migrated but the original could not be deactivated', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (path === PATH && options?.method === 'POST') {
                return [{
                    id: 1,
                    status: 'migrated',
                    warning: 'Copied, but could not deactivate the original: Post already trashed.',
                }];
            }
            if (path === PATH) {
                return { sourceActive: true, destinationActive: true, snippets: [snippets[0]] };
            }
            return {};
        });

        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets: [snippets[0]] }),
        });

        const [selectAll] = screen.getAllByRole('checkbox');
        await user.click(selectAll);
        await user.click(screen.getByRole('button', { name: /Migrate Selected/i }));

        expect(await screen.findByText('Migrated (see warning)')).toBeInTheDocument();
    });

    test('disables checkboxes and the button while a migration is pending', async () => {
        let resolveMigrate: (value: unknown) => void = () => {};
        apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
            if (path === PATH && options?.method === 'POST') {
                return new Promise((resolve) => { resolveMigrate = resolve; });
            }
            if (path === PATH) {
                return Promise.resolve({ sourceActive: true, destinationActive: true, snippets });
            }
            return Promise.resolve({});
        });

        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets }),
        });

        const [selectAll, ...rowCheckboxes] = screen.getAllByRole('checkbox');
        await user.click(selectAll);
        const migrateButton = screen.getByRole('button', { name: /Migrate Selected/i });
        await user.click(migrateButton);

        expect(selectAll).toBeDisabled();
        rowCheckboxes.forEach((checkbox) => expect(checkbox).toBeDisabled());
        expect(migrateButton).toBeDisabled();

        resolveMigrate([{ id: 1, status: 'migrated' }, { id: 2, status: 'migrated' }]);

        // Selection is cleared on success, so the migrate button stays disabled (nothing
        // selected); it's the row checkboxes, no longer blocked by the pending mutation,
        // that re-enable.
        await waitFor(() => expect(rowCheckboxes[0]).not.toBeDisabled());
    });

    test('refetches the migration list after a successful migrate', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (path === PATH && options?.method === 'POST') {
                return [{ id: 1, status: 'migrated' }];
            }
            if (path === PATH) {
                return { sourceActive: true, destinationActive: true, snippets: [] };
            }
            return {};
        });

        const user = userEvent.setup();
        render(<SnippetMigration direction={DIRECTION} />, {
            wrapper: wrapperWithStatus({ sourceActive: true, destinationActive: true, snippets: [snippets[0]] }),
        });

        const [selectAll] = screen.getAllByRole('checkbox');
        await user.click(selectAll);
        await user.click(screen.getByRole('button', { name: /Migrate Selected/i }));

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith(PATH);
        });
    });

    test('flips source and destination labels for the reverse direction', () => {
        render(<SnippetMigration direction="code-snippets-to-wpcode" />, {
            wrapper: wrapperWithStatus(
                { sourceActive: true, destinationActive: true, snippets: [] },
                'code-snippets-to-wpcode',
            ),
        });

        expect(screen.getByRole('heading', { name: 'Migrate Code Snippets → WPCode' })).toBeInTheDocument();
        expect(screen.getByText('No Code Snippets snippets to migrate.')).toBeInTheDocument();
    });

    test('posts to the direction-specific endpoint for the reverse direction', async () => {
        apiFetchMock.mockImplementation(async (path: string) => {
            if (path === '/snippets/migration/code-snippets-to-wpcode') {
                return [{ id: 1, status: 'migrated' }];
            }
            return {};
        });

        const user = userEvent.setup();
        render(<SnippetMigration direction="code-snippets-to-wpcode" />, {
            wrapper: wrapperWithStatus(
                { sourceActive: true, destinationActive: true, snippets: [snippets[0]] },
                'code-snippets-to-wpcode',
            ),
        });

        const [, firstRowCheckbox] = screen.getAllByRole('checkbox');
        await user.click(firstRowCheckbox);
        await user.click(screen.getByRole('button', { name: /Migrate Selected/i }));

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/snippets/migration/code-snippets-to-wpcode', {
                method: 'POST',
                body: JSON.stringify({ ids: [1] }),
            });
        });
    });
});
