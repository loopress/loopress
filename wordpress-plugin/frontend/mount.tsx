import { Component, createRoot } from '@wordpress/element';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface ErrorBoundaryState {
    error: Error | null;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: '16px', color: '#d63638' }}>
                    <strong>Something went wrong.</strong>
                    <pre style={{ marginTop: '8px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                        {this.state.error.message}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// Shared bootstrap for both edition entry points (index.tsx / index-free.tsx): the
// build ships exactly one of them per artifact, see scripts/build-flavor.cjs.
export function mount(app: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    });

    const container = document.getElementById('loopress-admin-root');
    if (container) {
        createRoot(container).render(
            <ErrorBoundary>
                <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
            </ErrorBoundary>
        );
    }
}
