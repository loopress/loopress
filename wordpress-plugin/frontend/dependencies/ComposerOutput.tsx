import React from 'react';

interface Props {
    output?: string | null;
}

export function ComposerOutput({ output }: Props) {
    if (!output) return null;
    return (
        <pre style={{
            background: '#1e1e1e', color: '#d4d4d4',
            padding: '10px 14px', borderRadius: 4,
            maxHeight: 300, overflowY: 'auto',
            fontSize: 12, lineHeight: 1.6,
            marginTop: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
            {output}
        </pre>
    );
}
