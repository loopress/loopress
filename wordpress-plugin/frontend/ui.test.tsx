import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton } from './ui';

describe('CopyButton', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('says the copy failed when the clipboard rejects', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });

        render(<CopyButton text="https://example.test" />);
        await user.click(screen.getByRole('button'));

        expect(await screen.findByText('Copy failed')).toBeInTheDocument();
    });

    test('says the copy failed when there is no clipboard (plain HTTP)', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('navigator', {});

        render(<CopyButton text="https://example.test" />);
        await user.click(screen.getByRole('button'));

        expect(screen.getByText('Copy failed')).toBeInTheDocument();
    });

    test('confirms a successful copy', async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        render(<CopyButton text="https://example.test" />);
        await user.click(screen.getByRole('button'));

        expect(await screen.findByText('Copied')).toBeInTheDocument();
        expect(writeText).toHaveBeenCalledWith('https://example.test');
    });
});
