import { afterEach, describe, expect, test, vi } from 'vitest';
import { confirmChange, highlightPhp, timeAgo } from './helpers';

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

describe('highlightPhp', () => {
    const kinds = (code: string) => highlightPhp(code).filter((t) => t.kind).map((t) => `${t.kind}:${t.text}`);

    test('colors keywords, variables, strings, attributes and comments', () => {
        expect(kinds("<?php\n#[Action('init')]\npublic function run($x) { return 'a'; } // done")).toEqual([
            'tag:<?php', "attribute:#[Action('init')]", 'keyword:public', 'keyword:function',
            'variable:$x', 'keyword:return', "string:'a'", 'comment:// done',
        ]);
    });

    test('leaves keywords inside strings and comments alone, and loses no text', () => {
        const code = "echo \"return $y\"; /* new class */ $total = 42;";
        expect(kinds(code)).toEqual(['keyword:echo', 'string:"return $y"', 'comment:/* new class */', 'variable:$total', 'number:42']);
        expect(highlightPhp(code).map((t) => t.text).join('')).toBe(code);
    });
});
