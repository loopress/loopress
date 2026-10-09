import { afterEach, describe, expect, test, vi } from 'vitest';
import { confirmChange, timeAgo } from './helpers';

const NOW = Date.parse('2026-10-09T12:00:00Z');

describe('timeAgo', () => {
    test('formats past and future instants in the largest whole unit', () => {
        expect(timeAgo('2026-10-09T09:00:00Z', NOW)).toBe('3 hours ago');
        expect(timeAgo('2026-10-08T12:00:00Z', NOW)).toBe('yesterday');
        expect(timeAgo('2026-10-09T12:20:00Z', NOW)).toBe('in 20 minutes');
        expect(timeAgo('2026-10-09T11:59:50Z', NOW)).toBe('just now');
    });

    test('returns an unparseable value untouched', () => {
        expect(timeAgo('not a date', NOW)).toBe('not a date');
    });
});

describe('confirmChange', () => {
    afterEach(() => {
        window.loopressData = { ...window.loopressData, environment: 'local' };
    });

    test('only asks on production unless asked to always confirm', () => {
        window.confirm = vi.fn().mockReturnValue(false);
        window.loopressData = { ...window.loopressData, environment: 'staging' };

        expect(confirmChange('Install x?')).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(confirmChange('Remove x?', true)).toBe(false);
        expect(window.confirm).toHaveBeenCalledWith('Remove x?');
    });

    test('names the production site', () => {
        window.confirm = vi.fn().mockReturnValue(true);
        window.loopressData = { ...window.loopressData, environment: 'production' };

        expect(confirmChange('Install x?')).toBe(true);
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('PRODUCTION'));
    });
});
