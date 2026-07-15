import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import { useQuery } from '@tanstack/react-query';
import { Button, ComboboxControl, SelectControl, Spinner } from '@wordpress/components';
import { apiFetch } from '../api';
import type { PackagistPackage, PackageVersion } from '../types';

interface Props {
    onInstall: (packageName: string, version: string) => Promise<void>;
    disabled: boolean;
}

interface VersionForm {
    version: string;
}

export function PackageSearch({ onInstall, disabled }: Props) {
    const [query, setQuery]           = useState('');
    const [debouncedQuery]            = useDebounce(query, 500);
    const [selected, setSelected]     = useState<PackagistPackage | null>(null);

    const { handleSubmit, setValue, watch, formState: { isSubmitting } } = useForm<VersionForm>({
        defaultValues: { version: '' },
    });

    const version = watch('version');

    const { data: results = [], isFetching: searching, isError: searchFailed } = useQuery<PackagistPackage[]>({
        queryKey: ['packagist-search', debouncedQuery],
        queryFn: async () => {
            const r = await fetch(`https://packagist.org/search.json?q=${encodeURIComponent(debouncedQuery)}&per_page=8`);
            if (!r.ok) throw new Error(`Packagist returned ${r.status}`);
            const d: { results?: PackagistPackage[] } = await r.json();
            return d.results ?? [];
        },
        enabled: query.length >= 2 && debouncedQuery.length >= 2 && !selected,
        staleTime: 30_000,
    });

    const { data: versions = [], isFetching: versionsLoading, isError: versionsFailed } = useQuery<PackageVersion[]>({
        queryKey: ['versions', selected?.name],
        queryFn: () => apiFetch<PackageVersion[]>(`/composer/versions?package=${encodeURIComponent(selected!.name)}`),
        enabled: !!selected,
        staleTime: 60_000,
    });

    useEffect(() => {
        if (versions.length === 0) return;
        const firstCompatible = versions.find(v => v.php_compatible === true)
            ?? versions.find(v => v.php_compatible === null)
            ?? versions[0];
        setValue('version', firstCompatible.version);
    }, [versions, setValue]);

    const handleSelect = (pkg: PackagistPackage) => {
        setSelected(pkg);
        setValue('version', '');
    };

    const handleClear = () => {
        setSelected(null);
        setQuery('');
        setValue('version', '');
    };

    const onSubmit = handleSubmit(async ({ version }) => {
        await onInstall(selected!.name, version);
    });

    // ── Step 1 : search results ───────────────────────────────────────────────

    if (!selected) return (
        <div>
            <ComboboxControl
                label="Search a Composer package"
                value={null}
                options={results.map(pkg => ({ value: pkg.name, label: pkg.name }))}
                onChange={(value) => {
                    const pkg = results.find(p => p.name === value);
                    if (pkg) handleSelect(pkg);
                }}
                isLoading={searching}
                onFilterValueChange={setQuery}
                placeholder="e.g. guzzlehttp/guzzle"
                __next40pxDefaultSize
            />
            {searchFailed && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#cc1818' }}>
                    Unable to reach Packagist. Check your internet connection.
                </p>
            )}
        </div>
    );

    // ── Step 2 : version picker ───────────────────────────────────────────────

    return (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={onSubmit}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', background: '#f6f7f7',
                border: '1px solid #ddd', borderRadius: 4,
            }}>
                <div>
                    <strong style={{ fontSize: 13 }}>{selected.name}</strong>
                    {selected.description && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666' }}>{selected.description}</p>
                    )}
                </div>
                <Button variant="tertiary" size="small" onClick={handleClear}>Change</Button>
            </div>

            {versionsLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666', fontSize: 13 }}>
                    <Spinner /> Fetching versions…
                </div>
            )}

            {!versionsLoading && versions.length > 0 && (
                <div>
                    <SelectControl
                        label="Version"
                        value={version}
                        options={versions.map((v, idx) => ({
                            value: v.version,
                            label: `${v.php_compatible === true ? '🟢' : v.php_compatible === false ? '🔴' : '❓'} ${v.version}${idx === 0 ? '  (latest)' : ''}`,
                        }))}
                        onChange={(val) => setValue('version', val)}
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                    />
                    {version && (() => {
                        const sel = versions.find(v => v.version === version);
                        if (!sel || sel.php_compatible) return null;
                        return (
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#cc1818' }}>
                                ⚠️ This version requires PHP {sel.php_constraint} (your server: PHP {window.loopressData?.phpVersion ?? '?'})
                            </p>
                        );
                    })()}
                </div>
            )}

            {!versionsLoading && versions.length === 0 && (
                <p style={{ color: '#666', fontSize: 13, margin: 0 }}>No stable versions found.</p>
            )}

            <Button
                variant="primary"
                type="submit"
                disabled={disabled || versionsLoading || !version || isSubmitting}
            >
                {isSubmitting ? 'Installing…' : `Install${version ? ` ${version}` : ''}`}
            </Button>
        </form>
    );
}
