import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    test('shows the namespace read-only, says where to change it and never writes', async () => {
        apiFetchMock.mockResolvedValue({ namespace: 'site/v1' });

        render(<ApiNamespaceSettings />, { wrapper });

        const input = await screen.findByLabelText(/API routes namespace/i);
        await waitFor(() => expect(input).toHaveValue('site/v1'));
        expect(input).toBeDisabled();
        expect(screen.getByText('loopress.json')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
        expect(apiFetchMock).toHaveBeenCalledTimes(1);
        expect(apiFetchMock).toHaveBeenCalledWith('/api-namespace');
    });
});
