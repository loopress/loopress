import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

function renderApp() {
    window.loopressData = {
        apiUrl: 'http://localhost/wp-json/loopress/v1',
        nonce: 'test-nonce',
        autoloadError: null,
        phpVersion: '8.2.29',
        pluginVersion: '2026.7.0',
    };

    // LightApp reads window.loopressData at module scope, so it must be imported
    // after loopressData is set; resetModules makes each render independent.
    return import('./LightApp').then(({ default: LightApp }) => render(<LightApp />));
}

describe('LightApp', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test('renders the Loopress Light heading with the plugin version', async () => {
        await renderApp();

        expect(screen.getByRole('heading', { name: 'Loopress Light' })).toBeInTheDocument();
        expect(screen.getByText('v2026.7.0')).toBeInTheDocument();
    });

    test('points the user at the CLI pairing flow', async () => {
        await renderApp();

        expect(screen.getByText(/lps snippet pull/i)).toBeInTheDocument();
    });
});
