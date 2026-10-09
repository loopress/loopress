import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { Pill, ResourceSection, Row, Table } from '../ui';
import { CELL, MONO, MUTED, timeAgo } from '../helpers';
import type { HookBinding, HookFile } from '../types';

function bindingLabel(binding: HookBinding): string {
    if (binding.type === 'cron') {
        return binding.hook ? `cron: ${binding.recurrence} → ${binding.hook}` : `cron: ${binding.recurrence}`;
    }
    return `${binding.type}: ${binding.hook ?? '?'}`;
}

export function HooksPanel() {
    const query = useQuery<HookFile[]>({
        queryKey: ['hook-files'],
        queryFn: () => apiFetch<HookFile[]>('/hook-files'),
        staleTime: 30_000,
    });
    const files = query.data ?? [];

    return (
        <ResourceSection
            title="Hooks"
            query={query}
            isEmpty={files.length === 0}
            errorText="Failed to load hooks."
            empty={<>No hook files uploaded yet. Push some with <code>lps hook push</code>.</>}
        >
            <Table columns={['File', 'Bound to']}>
                {files.map((file) => (
                    <Row key={file.filename}>
                        <td style={CELL}>
                            <strong>{file.filename}.php</strong>
                            {file.error && <Pill tone="error">Failed to load</Pill>}
                            {file.error && <div style={{ marginTop: 4, fontSize: 12, color: '#991b1b' }}>{file.error}</div>}
                        </td>
                        <td style={MONO}>
                            {file.hooks.length > 0
                                ? file.hooks.map((binding, i) => (
                                      <div key={i}>
                                          {bindingLabel(binding)}
                                          {binding.nextRun && (
                                              <span title={binding.nextRun} style={{ color: MUTED, fontFamily: 'inherit', marginLeft: 8 }}>
                                                  next run {timeAgo(binding.nextRun)}
                                              </span>
                                          )}
                                      </div>
                                  ))
                                : <span style={{ color: MUTED, fontFamily: 'inherit' }}>none detected</span>}
                        </td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}
