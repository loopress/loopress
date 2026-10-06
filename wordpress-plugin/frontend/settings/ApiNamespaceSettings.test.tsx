import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

import { ApiNamespaceSettings } from './ApiNamespaceSettings';

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ApiNamespaceSettings', () => {
    test('shows the saved namespace, saves an edit, then reflects what the server stored', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (!options) return { namespace: 'site/v1' };
            // The server normalizes the value, the field must show its answer after saving.
            return { namespace: JSON.parse(options.body as string).namespace.toLowerCase() };
        });

        render(<ApiNamespaceSettings />, { wrapper });

        const input = await screen.findByLabelText(/API routes namespace/i);
        await waitFor(() => expect(input).toHaveValue('site/v1'));
        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toBeDisabled();

        const user = userEvent.setup();
        await user.clear(input);
        await user.type(input, 'Shop/V2');
        expect(save).toBeEnabled();
        await user.click(save);

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/api-namespace', {
                method: 'PUT',
                body: JSON.stringify({ namespace: 'Shop/V2' }),
            });
        });
        await waitFor(() => expect(input).toHaveValue('shop/v2'));
        expect(save).toBeDisabled();
    });
});
