import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccountUpdateVersion, notifyAccountUpdated } from './account-cache-events';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('account cache update events', () => {
  it('retains an update when no detail listener is mounted and matches compact identifiers', () => {
    const values = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, dispatchEvent });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    notifyAccountUpdated('store-a');
    expect(values.size).toBe(1);
    expect(getAccountUpdateVersion('storea')).toBe(1000);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({ storeId: 'store-a' });
  });

  it('keeps in-memory invalidation and event delivery when storage is blocked', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }, dispatchEvent });
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    notifyAccountUpdated('storage-blocked');
    expect(getAccountUpdateVersion('storage-blocked')).toBe(2000);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
});
