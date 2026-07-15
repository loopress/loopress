import LogoBlack from '@loopress/assets/loopress-logo-black.svg';

const pluginVersion = window.loopressData?.pluginVersion ?? '';

export function AppShell({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
    return (
        <div className="wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                <img src={LogoBlack} alt={title} height={30} />
                <h1 style={{ margin: 0 }}>{title}</h1>
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: '#50575e',
                        background: '#f0f0f1',
                        borderRadius: 12,
                        padding: '2px 10px',
                    }}
                >
                    v{pluginVersion}
                </span>
            </div>
            {children}
        </div>
    );
}
