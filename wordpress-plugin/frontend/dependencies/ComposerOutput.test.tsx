import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComposerOutput } from './ComposerOutput';

describe('ComposerOutput', () => {
    test('renders nothing when output is undefined', () => {
        const { container } = render(<ComposerOutput />);
        expect(container.firstChild).toBeNull();
    });

    test('renders nothing when output is null', () => {
        const { container } = render(<ComposerOutput output={null} />);
        expect(container.firstChild).toBeNull();
    });

    test('renders nothing when output is empty string', () => {
        const { container } = render(<ComposerOutput output="" />);
        expect(container.firstChild).toBeNull();
    });

    test('renders output text in a <pre> block', () => {
        render(<ComposerOutput output="Installing guzzlehttp/guzzle" />);
        const pre = screen.getByText('Installing guzzlehttp/guzzle');
        expect(pre.tagName).toBe('PRE');
    });

    test('renders multi-line output', () => {
        const output = 'Line 1\nLine 2\nLine 3';
        render(<ComposerOutput output={output} />);
        expect(screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent === output)).toBeInTheDocument();
    });
});
