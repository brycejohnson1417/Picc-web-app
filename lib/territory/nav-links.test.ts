import { describe, expect, it } from 'vitest';
import {
  buildAppleMapsUrl,
  buildBrowserMapsUrl,
  buildGoogleMapsUrl,
  buildNavUrl,
  detectNavPlatform,
  hasNavigableDestination,
  navChoiceAvailability,
  navDestinationQuery,
  openNavTarget,
  type NavDestination,
  type NavPlatform,
} from '@/lib/territory/nav-links';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const store: NavDestination = {
  lat: 40.7128,
  lng: -74.006,
  address: '123 Canal St, New York, NY 10013',
  label: 'Gotham NYC',
};

const addressOnlyStore: NavDestination = {
  lat: null,
  lng: null,
  address: '123 Canal St, New York, NY 10013',
  label: 'Gotham NYC',
};

const emptyStore: NavDestination = { lat: null, lng: null, address: '  ', label: null };

const desktopPlatform: NavPlatform = { isIos: false, isMac: false, isAndroid: false, supportsAppleMapsApp: false };
const iosPlatform: NavPlatform = { isIos: true, isMac: false, isAndroid: false, supportsAppleMapsApp: true };

describe('navDestinationQuery', () => {
  it('prefers coordinates so the exact pin is preserved', () => {
    expect(navDestinationQuery(store)).toBe('40.7128,-74.006');
  });

  it('falls back to the street address when coordinates are missing', () => {
    expect(navDestinationQuery(addressOnlyStore)).toBe('123 Canal St, New York, NY 10013');
  });

  it('returns null when there is nothing to navigate to', () => {
    expect(navDestinationQuery(emptyStore)).toBeNull();
    expect(hasNavigableDestination(emptyStore)).toBe(false);
  });
});

describe('detectNavPlatform', () => {
  it('detects iOS', () => {
    expect(detectNavPlatform(IOS_UA).supportsAppleMapsApp).toBe(true);
    expect(detectNavPlatform(IOS_UA).isIos).toBe(true);
  });

  it('detects macOS', () => {
    const platform = detectNavPlatform(MAC_UA);
    expect(platform.isMac).toBe(true);
    expect(platform.supportsAppleMapsApp).toBe(true);
  });

  it('detects iPadOS behind a desktop Safari user agent', () => {
    const platform = detectNavPlatform(MAC_UA, 5);
    expect(platform.isIos).toBe(true);
    expect(platform.supportsAppleMapsApp).toBe(true);
  });

  it('reports no Apple Maps app on Android and Windows', () => {
    expect(detectNavPlatform(ANDROID_UA).supportsAppleMapsApp).toBe(false);
    expect(detectNavPlatform(WINDOWS_UA).supportsAppleMapsApp).toBe(false);
  });
});

describe('url builders', () => {
  it('builds an Apple Maps universal link with coordinates and travel mode', () => {
    const url = buildAppleMapsUrl(store, 'driving');
    expect(url).toContain('https://maps.apple.com/?');
    expect(url).toContain('daddr=40.7128%2C-74.006');
    expect(url).toContain('dirflg=d');
  });

  it('builds the Apple Maps native scheme when asked', () => {
    expect(buildAppleMapsUrl(store, 'walking', { native: true })).toContain('maps://?');
    expect(buildAppleMapsUrl(store, 'walking', { native: true })).toContain('dirflg=w');
  });

  it('maps bicycling to driving for Apple Maps, which has no bike flag', () => {
    expect(buildAppleMapsUrl(store, 'bicycling')).toContain('dirflg=d');
  });

  it('builds a Google Maps directions link', () => {
    const url = buildGoogleMapsUrl(store, 'transit');
    expect(url).toContain('https://www.google.com/maps/dir/?');
    expect(url).toContain('destination=40.7128%2C-74.006');
    expect(url).toContain('travelmode=transit');
  });

  it('builds the Google Maps native scheme when asked', () => {
    expect(buildGoogleMapsUrl(store, 'driving', { native: true })).toContain('comgooglemaps://?');
  });

  it('builds a web-only browser target', () => {
    const url = buildBrowserMapsUrl(store, 'driving');
    expect(url?.startsWith('https://')).toBe(true);
    expect(url).not.toContain('comgooglemaps://');
    expect(url).not.toContain('maps://');
  });

  it('can point the browser option at OpenStreetMap', () => {
    const url = buildBrowserMapsUrl(store, 'driving', 'openstreetmap');
    expect(url).toContain('https://www.openstreetmap.org/directions?');
    expect(url).toContain('40.7128%2C-74.006');
  });

  it('falls back to Google web when OpenStreetMap has no coordinates', () => {
    const url = buildBrowserMapsUrl(addressOnlyStore, 'driving', 'openstreetmap');
    expect(url).toContain('https://www.google.com/maps/dir/?');
  });

  it('returns null for every provider when there is no destination', () => {
    expect(buildAppleMapsUrl(emptyStore)).toBeNull();
    expect(buildGoogleMapsUrl(emptyStore)).toBeNull();
    expect(buildBrowserMapsUrl(emptyStore)).toBeNull();
  });
});

describe('buildNavUrl', () => {
  it('uses native schemes on iOS for both app choices', () => {
    expect(buildNavUrl('apple', store, 'driving', iosPlatform)).toContain('maps://?');
    expect(buildNavUrl('google', store, 'driving', iosPlatform)).toContain('comgooglemaps://?');
  });

  it('uses https links on non-Apple platforms', () => {
    expect(buildNavUrl('apple', store, 'driving', desktopPlatform)).toContain('https://maps.apple.com/');
    expect(buildNavUrl('google', store, 'driving', desktopPlatform)).toContain('https://www.google.com/maps/dir/');
  });

  it('never hands the browser choice to a native app', () => {
    const url = buildNavUrl('browser', store, 'driving', iosPlatform);
    expect(url?.startsWith('https://')).toBe(true);
  });
});

describe('navChoiceAvailability', () => {
  it('offers all three options on Apple platforms', () => {
    const options = navChoiceAvailability(store, iosPlatform);
    expect(options.every((option) => option.available)).toBe(true);
  });

  it('disables Apple Maps with a reason on non-Apple platforms instead of dropping it', () => {
    const options = navChoiceAvailability(store, desktopPlatform);
    const apple = options.find((option) => option.choice === 'apple');
    expect(apple?.available).toBe(false);
    expect(apple?.unavailableReason).toContain('Apple Maps is not available');
    expect(options.find((option) => option.choice === 'google')?.available).toBe(true);
    expect(options.find((option) => option.choice === 'browser')?.available).toBe(true);
  });

  it('disables every option when the store has no address or coordinates', () => {
    const options = navChoiceAvailability(emptyStore, iosPlatform);
    expect(options.every((option) => !option.available)).toBe(true);
  });
});

describe('openNavTarget', () => {
  it('opens web targets in a new tab with noopener', () => {
    const calls: Array<[string | URL | undefined, string | undefined, string | undefined]> = [];
    const url = openNavTarget('browser', store, {
      platform: desktopPlatform,
      openWindow: (target, name, features) => {
        calls.push([target, name, features]);
        return null;
      },
    });

    expect(url).toContain('https://');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('_blank');
    expect(calls[0][2]).toBe('noopener,noreferrer');
  });

  it('does nothing when the destination cannot be navigated to', () => {
    let opened = 0;
    const url = openNavTarget('google', emptyStore, {
      platform: desktopPlatform,
      openWindow: () => {
        opened += 1;
        return null;
      },
    });

    expect(url).toBeNull();
    expect(opened).toBe(0);
  });
});
