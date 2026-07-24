import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

import { SentryConsentAlert } from './SentryConsentAlert';

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('SentryConsentAlert', () => {
    test('asks for consent when nothing has been decided yet', async () => {
        apiFetchMock.mockResolvedValue({ enabled: null });

        render(<SentryConsentAlert />, { wrapper });

        await screen.findByRole('alert');
        expect(screen.getByText(/Send crash reports to Loopress\?/i)).toBeInTheDocument();
    });

    test('allow sends the PUT and the alert then disappears', async () => {
        let enabled: boolean | null = null;
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (options) {
                enabled = JSON.parse(options.body as string).enabled;
            }
            return { enabled };
        });

        render(<SentryConsentAlert />, { wrapper });

        await screen.findByRole('alert');

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Allow' }));

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/sentry/consent', {
                method: 'PUT',
                body: JSON.stringify({ enabled: true }),
            });
        });
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    test('deny sends the PUT and the alert then disappears', async () => {
        let enabled: boolean | null = null;
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (options) {
                enabled = JSON.parse(options.body as string).enabled;
            }
            return { enabled };
        });

        render(<SentryConsentAlert />, { wrapper });

        await screen.findByRole('alert');

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Deny' }));

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/sentry/consent', {
                method: 'PUT',
                body: JSON.stringify({ enabled: false }),
            });
        });
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    test('renders nothing once a decision is already on record', async () => {
        apiFetchMock.mockResolvedValue({ enabled: false });

        render(<SentryConsentAlert />, { wrapper });

        await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
