import { Page } from '@wordpress/admin-ui';
import LogoBlack from '@loopress/assets/loopress-logo-black.svg';

const pluginVersion = window.loopressData?.pluginVersion ?? '';

export function AppShell({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
    return (
        <Page
            title={title}
            visual={<img src={LogoBlack} alt="" height={30} />}
            badges={
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
            }
            showSidebarToggle={false}
            hasPadding
        >
            <div style={{ minHeight: "calc(100vh - 200px)" }}>{children}</div>
        </Page>
    );
}
