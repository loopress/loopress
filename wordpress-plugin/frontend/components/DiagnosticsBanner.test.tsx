import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiagnosticsBanner } from './DiagnosticsBanner';
import type { Diagnostics } from '../types';

function wrapperWithData(data: Diagnostics) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['diagnostics'], data);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

describe('DiagnosticsBanner', () => {
    test('renders nothing when there are no issues', () => {
        const data: Diagnostics = {
            php_version: '8.2.0',
            platform_php: '8.2.0',
            issues: [],
        };
        const { container } = render(
            <DiagnosticsBanner isLocked={false} />,
            { wrapper: wrapperWithData(data) },
        );
        expect(container.firstChild).toBeNull();
    });

    test('renders a warning for platform_php_mismatch', () => {
        const data: Diagnostics = {
            php_version: '8.2.29',
            platform_php: '8.1.0',
            issues: [
                {
                    code: 'platform_php_mismatch',
                    message: 'config.platform.php is 8.1.0 but the server is running PHP 8.2.29.',
                },
            ],
        };

        render(<DiagnosticsBanner isLocked={false} />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Platform issue detected/i)).toBeInTheDocument();
        expect(screen.getByText(/config\.platform\.php is 8\.1\.0/i)).toBeInTheDocument();
    });

    test('shows PHP version info in the notice', () => {
        const data: Diagnostics = {
            php_version: '8.2.29',
            platform_php: '8.1.0',
            issues: [{ code: 'platform_php_mismatch', message: 'Mismatch detected.' }],
        };

        render(<DiagnosticsBanner isLocked={false} />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Running PHP 8\.2\.29/i)).toBeInTheDocument();
        expect(screen.getByText(/composer\.json declares 8\.1\.0/i)).toBeInTheDocument();
    });

    test('fix button is enabled when not locked', () => {
        const data: Diagnostics = {
            php_version: '8.2.29',
            platform_php: '8.1.0',
            issues: [{ code: 'platform_php_mismatch', message: 'Mismatch.' }],
        };

        render(<DiagnosticsBanner isLocked={false} />, { wrapper: wrapperWithData(data) });
        const button = screen.getByRole('button', { name: /Set to PHP/i });
        expect(button).not.toBeDisabled();
    });

    test('fix button is disabled when production lock is active', () => {
        const data: Diagnostics = {
            php_version: '8.2.29',
            platform_php: '8.1.0',
            issues: [{ code: 'platform_php_mismatch', message: 'Mismatch.' }],
        };

        render(<DiagnosticsBanner isLocked={true} />, { wrapper: wrapperWithData(data) });
        const button = screen.getByRole('button', { name: /Set to PHP/i });
        expect(button).toBeDisabled();
    });

    test('renders multiple issues', () => {
        const data: Diagnostics = {
            php_version: '8.2.29',
            platform_php: null,
            issues: [
                { code: 'platform_php_missing', message: 'config.platform.php is not set.' },
            ],
        };

        render(<DiagnosticsBanner isLocked={false} />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Platform issue detected/i)).toBeInTheDocument();
        expect(screen.getByText(/config\.platform\.php is not set/i)).toBeInTheDocument();
    });
});
