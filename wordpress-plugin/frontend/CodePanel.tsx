import { ApiRoutes } from './api-routes/ApiRoutes';
import { HooksPanel } from './hooks/HooksPanel';
import { AppsPanel } from './apps/AppsPanel';
import { MUTED } from './helpers';

// API routes, hooks and apps share one lane: code pushed from the repo with `lps`, listed here
// read-only. One tab for the three instead of three near-identical tabs.
export function CodePanel() {
    return (
        <>
            <p style={{ color: MUTED, fontSize: 13, marginTop: 0 }}>
                Code pushed from your repository with the Loopress CLI. Read-only here: change it in Git, then push.
            </p>
            <ApiRoutes />
            <HooksPanel />
            <AppsPanel />
        </>
    );
}
