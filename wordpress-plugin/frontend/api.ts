export class ApiError extends Error {
    output?: string;
    constructor(message: string, output?: string) {
        super(message);
        this.name = 'ApiError';
        this.output = output;
    }
}

const ALLOWED_ENDPOINTS = [
    '/composer/diagnostics',
    '/composer/fix-platform',
    '/composer/audit',
    '/composer/installed',
    '/composer/remove',
    '/composer/require',
    '/composer/repair',
    '/composer/versions',
];

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    if (!window.loopressData) {
        throw new ApiError('Loopress data unavailable. Please reload the page.');
    }
    const { apiUrl, nonce } = window.loopressData;

    const pathname = `/${path.replace(/^\/+/, '')}`.split('?')[0];
    if (!ALLOWED_ENDPOINTS.includes(pathname)) {
        throw new ApiError('Unknown API endpoint.');
    }

    const base = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const relativePath = path.replace(/^\/+/, '');

    let url: URL;
    try {
        url = new URL(relativePath, base);
    } catch {
        throw new ApiError('Invalid API path.');
    }
    if (url.origin !== new URL(apiUrl).origin) {
        throw new ApiError('Refusing to fetch a different origin than the configured API.');
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': nonce,
            ...options.headers,
        },
    });

    const body = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
        throw new ApiError(
            typeof body.error === 'string' ? body.error : `HTTP ${response.status}`,
            typeof body.output === 'string' ? body.output : undefined,
        );
    }

    return body as T;
}
