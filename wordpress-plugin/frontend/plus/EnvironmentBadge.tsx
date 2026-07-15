import React from 'react';

const ENV_STYLES: Record<string, { background: string; color: string; label: string }> = {
    production:  { background: '#cc1818', color: '#fff', label: '🔴 PRODUCTION' },
    staging:     { background: '#b45309', color: '#fff', label: '🟡 STAGING' },
    development: { background: '#166534', color: '#fff', label: '🟢 DEVELOPMENT' },
};

interface Props {
    environment: string;
}

export function EnvironmentBadge({ environment }: Props) {
    const style = ENV_STYLES[environment] ?? ENV_STYLES.development;
    return (
        <span style={{ ...style, padding: '4px 12px', borderRadius: 4, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
            {style.label}
        </span>
    );
}
