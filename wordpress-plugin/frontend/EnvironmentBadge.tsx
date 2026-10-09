// wp_get_environment_type() values. Production is red on purpose: it is the one environment
// where a change made from wp-admin is a change made live.
const ENV_STYLES: Record<string, { background: string; label: string }> = {
    production: { background: '#cc1818', label: 'Production' },
    staging: { background: '#b45309', label: 'Staging' },
    development: { background: '#166534', label: 'Development' },
    local: { background: '#166534', label: 'Local' },
};

export function EnvironmentBadge({ environment }: Readonly<{ environment: string }>) {
    const { background, label } = ENV_STYLES[environment] ?? ENV_STYLES.production;

    return (
        <span
            title="WordPress environment type (WP_ENVIRONMENT_TYPE)"
            style={{
                background, color: '#fff', padding: '2px 10px', borderRadius: 12,
                fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
            }}
        >
            {label}
        </span>
    );
}
