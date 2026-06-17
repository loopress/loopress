// Replaces @wordpress/components with thin wrappers so tests run with a single
// React copy. @wordpress/element ships its own react, which causes "Invalid hook
// call" errors when the component tree mixes it with the top-level react.
import React from 'react';
import { mock } from 'bun:test';

mock.module('@wordpress/components', () => ({
    Button: ({ children, onClick, disabled, variant, isDestructive, size, type, style }: any) => (
        <button onClick={onClick} disabled={disabled} type={type ?? 'button'} style={style}>
            {children}
        </button>
    ),
    Card: ({ children, style }: any) => <div style={style}>{children}</div>,
    CardBody: ({ children }: any) => <div>{children}</div>,
    CardHeader: ({ children }: any) => <div>{children}</div>,
    Notice: ({ children, status, onRemove, isDismissible }: any) => (
        <div role="alert" data-status={status}>
            {children}
            {isDismissible && onRemove && (
                <button onClick={onRemove} aria-label="Dismiss">×</button>
            )}
        </div>
    ),
    Spinner: () => <span aria-label="loading" />,
    ToggleControl: ({ checked, onChange, label, disabled, help }: any) => (
        <label>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
            />
            {label}
            {help && <span>{help}</span>}
        </label>
    ),
    ComboboxControl: ({ label, value, options, onChange, onFilterValueChange, placeholder, isLoading }: any) => (
        <div>
            <label htmlFor="combo-input">
                {label}
            </label>
            <input
                id="combo-input"
                aria-label={label}
                placeholder={placeholder}
                onChange={(e) => onFilterValueChange?.(e.target.value)}
                value={value ?? ''}
            />
            {options?.map((opt: any) => (
                <button key={opt.value} onClick={() => onChange(opt.value)}>
                    {opt.label}
                </button>
            ))}
        </div>
    ),
}));

mock.module('@wordpress/element', () => ({
    ...React,
    createElement: React.createElement,
    Fragment: React.Fragment,
    render: (element: React.ReactElement, container: Element) => {
        const { createRoot } = require('react-dom/client');
        createRoot(container).render(element);
    },
}));
