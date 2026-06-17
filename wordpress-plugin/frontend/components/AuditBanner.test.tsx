import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditBanner } from './AuditBanner';
import type { AuditResult } from '../types';

function wrapperWithData(data: AuditResult) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['audit'], data);
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function emptyWrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    client.setQueryData(['audit'], { advisories: {}, abandoned: {} } satisfies AuditResult);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('AuditBanner', () => {
    test('renders nothing when there are no advisories or abandoned packages', () => {
        const { container } = render(<AuditBanner />, { wrapper: emptyWrapper });
        expect(container.firstChild).toBeNull();
    });

    test('renders security advisory notice', () => {
        const data: AuditResult = {
            advisories: {
                'some/package': [
                    {
                        advisoryId: 'PKSA-001',
                        packageName: 'some/package',
                        remoteId: 'CVE-2024-1234',
                        title: 'Remote code execution via deserialization',
                        link: 'https://github.com/advisories/PKSA-001',
                        cve: 'CVE-2024-1234',
                        affectedVersions: '>=1.0,<1.4.2',
                        reportedAt: '2024-01-01T00:00:00+00:00',
                    },
                ],
            },
            abandoned: {},
        };

        render(<AuditBanner />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Security advisory: some\/package/i)).toBeInTheDocument();
        expect(screen.getByText('CVE-2024-1234')).toBeInTheDocument();
        expect(screen.getByText('Remote code execution via deserialization')).toBeInTheDocument();
        expect(screen.getByText(/>=1\.0,<1\.4\.2/)).toBeInTheDocument();
    });

    test('renders advisory without CVE', () => {
        const data: AuditResult = {
            advisories: {
                'some/package': [
                    {
                        advisoryId: 'PKSA-002',
                        packageName: 'some/package',
                        remoteId: 'PKSA-002',
                        title: 'CSRF vulnerability',
                        link: 'https://github.com/advisories/PKSA-002',
                        cve: null,
                        affectedVersions: '<2.0',
                        reportedAt: '2024-02-01T00:00:00+00:00',
                    },
                ],
            },
            abandoned: {},
        };

        render(<AuditBanner />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Security advisory/i)).toBeInTheDocument();
        expect(screen.queryByText(/CVE-/)).toBeNull();
    });

    test('renders abandoned package warning with replacement', () => {
        const data: AuditResult = {
            advisories: {},
            abandoned: { 'old/package': 'new/replacement' },
        };

        render(<AuditBanner />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Abandoned package: old\/package/i)).toBeInTheDocument();
        expect(screen.getByText('new/replacement')).toBeInTheDocument();
    });

    test('renders abandoned package without replacement', () => {
        const data: AuditResult = {
            advisories: {},
            abandoned: { 'old/package': null },
        };

        render(<AuditBanner />, { wrapper: wrapperWithData(data) });
        expect(screen.getByText(/Abandoned package: old\/package/i)).toBeInTheDocument();
        expect(screen.queryByText(/Suggested replacement/i)).toBeNull();
    });

    test('renders multiple advisories for the same package', () => {
        const data: AuditResult = {
            advisories: {
                'vuln/pkg': [
                    {
                        advisoryId: 'A-1',
                        packageName: 'vuln/pkg',
                        remoteId: 'CVE-2024-0001',
                        title: 'First issue',
                        link: 'https://example.com/1',
                        cve: 'CVE-2024-0001',
                        affectedVersions: '<1.0',
                        reportedAt: '2024-01-01T00:00:00+00:00',
                    },
                    {
                        advisoryId: 'A-2',
                        packageName: 'vuln/pkg',
                        remoteId: 'CVE-2024-0002',
                        title: 'Second issue',
                        link: 'https://example.com/2',
                        cve: 'CVE-2024-0002',
                        affectedVersions: '<1.1',
                        reportedAt: '2024-01-02T00:00:00+00:00',
                    },
                ],
            },
            abandoned: {},
        };

        render(<AuditBanner />, { wrapper: wrapperWithData(data) });
        expect(screen.getAllByText(/Security advisory/i)).toHaveLength(2);
    });
});
