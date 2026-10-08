import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

import { UsageStatsSettings } from './UsageStatsSettings';

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('UsageStatsSettings', () => {
    test('reflects the stored value and lets an admin flip it', async () => {
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (!options) return { enabled: true };
            return { enabled: JSON.parse(options.body as string).enabled };
        });

        render(<UsageStatsSettings />, { wrapper });

        const toggle = await screen.findByLabelText(/Send anonymous usage statistics/i);
        await waitFor(() => expect(toggle).toBeChecked());

        const user = userEvent.setup();
        await user.click(toggle);

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/usage-stats/consent', {
                method: 'PUT',
                body: JSON.stringify({ enabled: false }),
            });
        });
        await waitFor(() => expect(toggle).not.toBeChecked());
    });
});
