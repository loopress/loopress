import { useQuery } from '@tanstack/react-query';
import { Notice, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import type { HookBinding, HookFile } from '../types';

function bindingLabel(binding: HookBinding): string {
    if (binding.type === 'cron') {
        return binding.hook ? `cron: ${binding.recurrence} → ${binding.hook}` : `cron: ${binding.recurrence}`;
    }
    return `${binding.type}: ${binding.hook ?? '?'}`;
}

export function HooksPanel() {
    const { data: files = [], isPending, isFetching, isError } = useQuery<HookFile[]>({
        queryKey: ['hook-files'],
        queryFn: () => apiFetch<HookFile[]>('/hook-files'),
        staleTime: 30_000,
    });

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>Hooks</strong>
                {isFetching && !isPending && <Spinner />}
            </div>

            {isError && (
                <Notice status="error" isDismissible={false}>
                    Failed to load hooks.
                </Notice>
            )}

            {isPending && (
                <>
                    <style>{`@keyframes lp-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                height: 12,
                                width: 220,
                                background: '#e0e0e0',
                                borderRadius: 4,
                                margin: '8px 0',
                                animation: `lp-pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
                            }}
                        />
                    ))}
                </>
            )}

            {!isPending && !isError && files.length === 0 && (
                <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
                    No hook files uploaded yet. Push some with <code>lps hook push</code>.
                </p>
            )}

            {files.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>File</th>
                            <th style={{ padding: '6px 8px' }}>Bound to</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((file) => (
                            <tr key={file.filename} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px' }}>
                                    <strong>{file.filename}.php</strong>
                                    {file.error && (
                                        <span style={{
                                            marginLeft: 8, fontSize: 11, fontWeight: 500,
                                            color: '#991b1b', background: '#fee2e2', borderRadius: 12, padding: '2px 8px',
                                        }}>
                                            Failed to load
                                        </span>
                                    )}
                                    {file.error && (
                                        <div style={{ marginTop: 4, fontSize: 12, color: '#991b1b' }}>{file.error}</div>
                                    )}
                                </td>
                                <td style={{ padding: '8px', fontFamily: 'monospace', color: '#1d4ed8' }}>
                                    {file.hooks.length > 0
                                        ? file.hooks.map((binding, i) => (
                                              <div key={i}>{bindingLabel(binding)}</div>
                                          ))
                                        : <span style={{ color: '#666', fontFamily: 'inherit' }}>none detected</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
