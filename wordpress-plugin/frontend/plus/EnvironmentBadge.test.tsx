import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnvironmentBadge } from './EnvironmentBadge';

describe('EnvironmentBadge', () => {
    test('renders production badge', () => {
        render(<EnvironmentBadge environment="production" />);
        expect(screen.getByText(/PRODUCTION/i)).toBeInTheDocument();
    });

    test('renders staging badge', () => {
        render(<EnvironmentBadge environment="staging" />);
        expect(screen.getByText(/STAGING/i)).toBeInTheDocument();
    });

    test('renders development badge', () => {
        render(<EnvironmentBadge environment="development" />);
        expect(screen.getByText(/DEVELOPMENT/i)).toBeInTheDocument();
    });

    test('falls back to development style for unknown environment', () => {
        render(<EnvironmentBadge environment="unknown-env" />);
        expect(screen.getByText(/DEVELOPMENT/i)).toBeInTheDocument();
    });

    test('production badge has red background', () => {
        render(<EnvironmentBadge environment="production" />);
        const badge = screen.getByText(/PRODUCTION/i);
        expect(badge).toHaveStyle({ background: '#cc1818' });
    });

    test('staging badge has amber background', () => {
        render(<EnvironmentBadge environment="staging" />);
        const badge = screen.getByText(/STAGING/i);
        expect(badge).toHaveStyle({ background: '#b45309' });
    });

    test('development badge has green background', () => {
        render(<EnvironmentBadge environment="development" />);
        const badge = screen.getByText(/DEVELOPMENT/i);
        expect(badge).toHaveStyle({ background: '#166534' });
    });
});
