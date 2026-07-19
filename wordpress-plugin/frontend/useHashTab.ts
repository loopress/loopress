import { useEffect, useState } from 'react';

function currentHash(): string {
    return window.location.hash.replace(/^#/, '');
}

/**
 * Keeps a TabPanel's active tab in sync with the URL hash: reflects the active tab in
 * the hash on select, and picks up the hash (including browser back/forward) on load.
 * `@wordpress/components`' TabPanel has no controlled-selection prop, so callers must
 * remount it on tab change via `key={activeTab}` for external hash changes to take effect.
 */
export function useHashTab(tabNames: string[], fallback: string) {
    const [activeTab, setActiveTab] = useState(() => {
        const fromHash = currentHash();
        return tabNames.includes(fromHash) ? fromHash : fallback;
    });

    useEffect(() => {
        const onHashChange = () => {
            const fromHash = currentHash();
            if (tabNames.includes(fromHash)) {
                setActiveTab(fromHash);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [tabNames.join('|')]);

    const onSelect = (tabName: string) => {
        setActiveTab(tabName);
        window.location.hash = tabName;
    };

    return { activeTab, onSelect };
}
