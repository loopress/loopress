import React from 'react';

export function NoticeSkeleton() {
    return (
        <div style={{ maxWidth: 600, marginBottom: 20 }}>
            <style>{'@keyframes lp-pulse{0%,100%{opacity:1}50%{opacity:.4}}'}</style>
            <div
                data-testid="skeleton"
                style={{
                    height: 48,
                    borderRadius: 4,
                    background: '#e0e0e0',
                    animation: 'lp-pulse 1.5s ease-in-out infinite',
                }}
            />
        </div>
    );
}
