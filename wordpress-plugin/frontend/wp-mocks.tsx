// Replaces @wordpress/components with thin wrappers so tests run with a single
// React copy. @wordpress/element ships its own react, which causes "Invalid hook
// call" errors when the component tree mixes it with the top-level react.
import { vi } from 'vitest';
import React from 'react';

vi.mock('@wordpress/components', () => ({
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
                disabled={disabled}
            />
            {label}
            {help && <span>{help}</span>}
        </label>
    ),
    SelectControl: ({ label, value, options, onChange }: any) => (
        <div>
            <label htmlFor="select-control">{label}</label>
            <select id="select-control" aria-label={label} value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
                {options?.map((opt: any) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    ),
    ComboboxControl: ({ label, value, options, onChange, onFilterValueChange, placeholder, isLoading }: any) => (
        <div>
            <label htmlFor="combo-input">{label}</label>
            <input
                id="combo-input"
                aria-label={label}
                placeholder={placeholder}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFilterValueChange?.(e.target.value)}
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

vi.mock('@wordpress/element', () => ({
    ...React,
    createElement: React.createElement,
    Fragment: React.Fragment,
    render: (element: React.ReactElement, container: Element) => {
        const { createRoot } = require('react-dom/client');
        createRoot(container).render(element);
    },
}));
