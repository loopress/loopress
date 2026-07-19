import { describe, expect, test, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHashTab } from './useHashTab';

function setHash(hash: string) {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
}

describe('useHashTab', () => {
    beforeEach(() => {
        window.location.hash = '';
    });

    test('defaults to the fallback tab when the hash is empty', () => {
        const { result } = renderHook(() => useHashTab(['a', 'b'], 'a'));

        expect(result.current.activeTab).toBe('a');
    });

    test('picks up the initial tab from the hash', () => {
        window.location.hash = '#b';

        const { result } = renderHook(() => useHashTab(['a', 'b'], 'a'));

        expect(result.current.activeTab).toBe('b');
    });

    test('falls back when the hash does not match a known tab', () => {
        window.location.hash = '#unknown';

        const { result } = renderHook(() => useHashTab(['a', 'b'], 'a'));

        expect(result.current.activeTab).toBe('a');
    });

    test('updates the hash when a tab is selected', () => {
        const { result } = renderHook(() => useHashTab(['a', 'b'], 'a'));

        act(() => result.current.onSelect('b'));

        expect(result.current.activeTab).toBe('b');
        expect(window.location.hash).toBe('#b');
    });

    test('reacts to hashchange events, e.g. browser back/forward', () => {
        const { result } = renderHook(() => useHashTab(['a', 'b'], 'a'));

        act(() => setHash('#b'));

        expect(result.current.activeTab).toBe('b');
    });

    test('ignores a hashchange to a tab name this hook does not know about', () => {
        const { result } = renderHook(() => useHashTab(['a', 'b'], 'a'));

        act(() => setHash('#unrelated'));

        expect(result.current.activeTab).toBe('a');
    });
});
