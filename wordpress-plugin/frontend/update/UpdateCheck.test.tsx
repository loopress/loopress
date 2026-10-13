import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UpdateCheck } from './UpdateCheck';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const status = (latest: string | null, available: boolean) => ({
    current_version: '2026.15.0', latest_version: latest, update_available: available, release_url: null,
});

describe('UpdateCheck', () => {
    beforeEach(() => apiFetchMock.mockReset());

    test('forces a check and offers the update when a newer version exists', async () => {
        apiFetchMock.mockResolvedValue(status('2026.16.0', true));
        render(<UpdateCheck />, { wrapper });

        await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

        expect(apiFetchMock).toHaveBeenCalledWith('/update/check', { method: 'POST' });
        expect(await screen.findByText('Version 2026.16.0 available')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Update' })).toHaveAttribute('href', 'plugins.php');
    });

    test('says up to date, and does not claim it when GitHub could not be reached', async () => {
        apiFetchMock.mockResolvedValueOnce(status('2026.15.0', false)).mockResolvedValueOnce(status(null, false));
        render(<UpdateCheck />, { wrapper });
        const button = screen.getByRole('button', { name: 'Check for updates' });

        await userEvent.click(button);
        expect(await screen.findByText('Up to date')).toBeInTheDocument();

        await userEvent.click(button);
        expect(await screen.findByText(/Couldn.t reach GitHub/)).toBeInTheDocument();
        expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    });
});
