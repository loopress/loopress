import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

import { ApiError } from '../api';
import { SiteReportSettings } from './SiteReportSettings';

const TOKEN = 'lps_site_0123456789abcdef';
const disconnected = { connected: false, token: null, connectedUrl: null, url: 'https://example.com' };
const connected = { connected: true, token: 'lps_site_…cdef', connectedUrl: 'https://example.com', url: 'https://example.com' };

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function paste() {
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/^Site token/);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, TOKEN);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
}

describe('SiteReportSettings', () => {
    test('connecting sends the token and shows the masked one', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) =>
            options?.method === 'PUT' ? { ...connected, result: 'connected' } : disconnected);

        render(<SiteReportSettings />, { wrapper });
        await paste();

        expect(apiFetchMock).toHaveBeenCalledWith('/site-report', { method: 'PUT', body: JSON.stringify({ token: TOKEN }) });
        expect(await screen.findByText('lps_site_…cdef')).toBeInTheDocument();
        expect(screen.queryByText(/could not be reached/)).toBeNull();
    });

    test('an unreachable api keeps the token and says so', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) =>
            options?.method === 'PUT' ? { ...connected, result: 'unreachable' } : disconnected);

        render(<SiteReportSettings />, { wrapper });
        await paste();

        expect(await screen.findByText(/Token saved, but the Loopress console could not be reached/)).toBeInTheDocument();
    });

    test('a rejected token shows the api message', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (options?.method === 'PUT') throw new ApiError('This token belongs to https://prod.example.com, not to this site.', undefined, 409);
            return disconnected;
        });

        render(<SiteReportSettings />, { wrapper });
        await paste();

        expect(await screen.findByText(/This token belongs to https:\/\/prod.example.com/)).toBeInTheDocument();
        expect(screen.getByLabelText(/^Site token/)).toBeInTheDocument();
    });

    test('a token copied from another site is flagged', async () => {
        apiFetchMock.mockResolvedValue({ ...connected, connectedUrl: 'https://prod.example.com' });

        render(<SiteReportSettings />, { wrapper });

        expect(await screen.findByText(/This token was connected from https:\/\/prod.example.com/)).toBeInTheDocument();
    });

    test('disconnect clears it', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) =>
            options?.method === 'DELETE' ? disconnected : connected);

        render(<SiteReportSettings />, { wrapper });
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: 'Disconnect' }));

        await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/site-report', { method: 'DELETE' }));
        expect(await screen.findByLabelText(/^Site token/)).toBeInTheDocument();
    });
});
