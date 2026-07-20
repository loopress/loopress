import { useQuery } from '@tanstack/react-query';
import { Notice } from '@wordpress/components';
import { apiFetch } from '../api';
import type { UpdateStatus } from '../types';

export function UpdateNotice() {
    const { data } = useQuery<UpdateStatus>({
        queryKey: ['update-status'],
        queryFn: () => apiFetch<UpdateStatus>('/update'),
        staleTime: 60_000,
    });

    if (!data?.update_available) return null;

    return (
        <div style={{ maxWidth: 600, marginBottom: 20 }}>
            <Notice status="info" isDismissible={false}>
                Loopress Full {data.latest_version} is available. You are running {data.current_version}.{' '}
                {data.release_url && (
                    <a href={data.release_url} target="_blank" rel="noreferrer">
                        View release
                    </a>
                )}{' '}
                Loopress Full is not distributed through WordPress.org and must be updated manually.
            </Notice>
        </div>
    );
}
