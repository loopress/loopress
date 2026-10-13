export class ApiError extends Error {
    output?: string;
    status?: number;
    constructor(message: string, output?: string, status?: number) {
        super(message);
        this.name = 'ApiError';
        this.output = output;
        this.status = status;
    }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    if (!window.loopressData) {
        throw new ApiError('Loopress data unavailable. Please reload the page.');
    }
    const { apiUrl, nonce } = window.loopressData;
    const response = await fetch(`${apiUrl}${path}`, {
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
            response.status,
        );
    }

    return body as T;
}
