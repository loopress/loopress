import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, TextControl, Button, Notice } from '@wordpress/components';
import { apiFetch, ApiError } from '../api';
import type { ApiNamespace } from '../types';

export function ApiNamespaceSettings() {
    const queryClient = useQueryClient();

    const { data } = useQuery<ApiNamespace>({
        queryKey: ['api-namespace'],
        queryFn: () => apiFetch<ApiNamespace>('/api-namespace'),
    });

    const [value, setValue] = useState('');
    useEffect(() => {
        if (data) setValue(data.namespace);
    }, [data]);

    const { mutate: save, isPending, error } = useMutation({
        mutationFn: (namespace: string) => apiFetch<ApiNamespace>('/api-namespace', {
            method: 'PUT',
            body: JSON.stringify({ namespace }),
        }),
        onSuccess: (result) => queryClient.setQueryData(['api-namespace'], result),
    });

    return (
        <Card style={{ maxWidth: 600, marginTop: 12 }}>
            <CardBody>
                <TextControl
                    label="API routes namespace"
                    value={value}
                    disabled={!data || isPending}
                    onChange={setValue}
                    help="REST namespace your api/ files register under, e.g. hello.php becomes {namespace}/hello. Changing this changes every route's URL."
                />
                {error instanceof ApiError && (
                    <Notice status="error" isDismissible={false}>
                        {error.message}
                    </Notice>
                )}
                <Button
                    variant="secondary"
                    size="small"
                    disabled={!data || isPending || value === data?.namespace}
                    onClick={() => save(value)}
                    style={{ marginTop: 8 }}
                >
                    Save
                </Button>
            </CardBody>
        </Card>
    );
}
