import { describe, expect, test, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError } from './api';

function stubLoopressData(apiUrl: string) {
    (window as any).loopressData = {
        apiUrl,
        nonce: 'test-nonce',
        autoloadError: null,
        phpVersion: '8.2.29',
    };
}

describe('apiFetch', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({}),
        }));
    });

    test('joins a root-relative path onto the REST base path', async () => {
        stubLoopressData('http://localhost/wp-json/loopress/v1');

        await apiFetch('/composer/repair', { method: 'POST' });

        expect(fetch).toHaveBeenCalledWith(
            new URL('http://localhost/wp-json/loopress/v1/composer/repair'),
            expect.anything(),
        );
    });

    test('joins a path without a leading slash the same way', async () => {
        stubLoopressData('http://localhost/wp-json/loopress/v1');

        await apiFetch('composer/repair', { method: 'POST' });

        expect(fetch).toHaveBeenCalledWith(
            new URL('http://localhost/wp-json/loopress/v1/composer/repair'),
            expect.anything(),
        );
    });

    test('rejects a path that resolves to a different origin', async () => {
        stubLoopressData('http://localhost/wp-json/loopress/v1');

        await expect(apiFetch('http://evil.example/steal')).rejects.toThrow(ApiError);
        expect(fetch).not.toHaveBeenCalled();
    });

    test('rejects an endpoint that is not on the allowlist', async () => {
        stubLoopressData('http://localhost/wp-json/loopress/v1');

        await expect(apiFetch('/composer/../../wp-admin/delete-everything')).rejects.toThrow(ApiError);
        expect(fetch).not.toHaveBeenCalled();
    });

    test('allows a whitelisted endpoint with query params', async () => {
        stubLoopressData('http://localhost/wp-json/loopress/v1');

        await apiFetch('/composer/versions?package=guzzlehttp%2Fguzzle');

        expect(fetch).toHaveBeenCalledWith(
            new URL('http://localhost/wp-json/loopress/v1/composer/versions?package=guzzlehttp%2Fguzzle'),
            expect.anything(),
        );
    });
});
