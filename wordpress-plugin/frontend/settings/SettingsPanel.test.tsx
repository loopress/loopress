import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api')>();
    return { ...actual, apiFetch: apiFetchMock };
});

import { SettingsPanel } from './SettingsPanel';

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('SettingsPanel', () => {
    test('reset button calls the global settings endpoint and unchecks the Sentry toggle', async () => {
        let enabled: boolean | null = true;
        apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
            if (path === '/settings' && options?.method === 'DELETE') {
                enabled = null;
                return { reset: true };
            }
            return { enabled };
        });

        render(<SettingsPanel />, { wrapper });

        const toggle = await screen.findByLabelText(/Send crash reports to Loopress/i);
        await waitFor(() => expect(toggle).toBeChecked());

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Reset all settings to default' }));

        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith('/settings', { method: 'DELETE' });
        });
        await waitFor(() => expect(toggle).not.toBeChecked());
    });
});
