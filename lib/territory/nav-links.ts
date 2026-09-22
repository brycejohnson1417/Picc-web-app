/**
 * Outbound navigation link building for dispensary directions.
 *
 * The app never picks a maps provider on the user's behalf. A chooser is shown
 * with three explicit options: Apple Maps, Google Maps, and Open in browser.
 * This module holds the pure URL-building and platform-detection logic so the
 * UI layer stays dumb and the behavior is unit testable.
 */

export type NavAppChoice = 'apple' | 'google' | 'browser';

export type NavTravelMode = 'driving' | 'walking' | 'transit' | 'bicycling';

export interface NavDestination {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
}

export interface NavPlatform {
  isIos: boolean;
  isMac: boolean;
  isAndroid: boolean;
  /** Apple Maps can be handed off to natively (iOS, iPadOS, macOS). */
  supportsAppleMapsApp: boolean;
}

/**
 * Where the "Open in browser" option points.
 *
 * 'google'        - Google Maps web directions. On mobile the OS may still hand
 *                   the https link to an installed Google Maps app; that is an
 *                   OS-level universal-link behavior the web app cannot suppress.
 * 'openstreetmap' - OpenStreetMap web directions. No mobile app claims these
 *                   links, so this is the only option guaranteed to stay in the
 *                   browser on every platform.
 */
export type BrowserMapsProvider = 'google' | 'openstreetmap';

export const BROWSER_MAPS_PROVIDER: BrowserMapsProvider = 'google';

const APPLE_DIRFLG: Record<NavTravelMode, string> = {
  driving: 'd',
  walking: 'w',
  transit: 'r',
  // Apple Maps has no bicycling directions flag; fall back to driving.
  bicycling: 'd',
};

const OSM_ENGINE: Record<NavTravelMode, string> = {
  driving: 'fossgis_osrm_car',
  walking: 'fossgis_osrm_foot',
  bicycling: 'fossgis_osrm_bike',
  // OSM has no transit router; car is the closest usable default.
  transit: 'fossgis_osrm_car',
};

export function hasCoordinates(destination: NavDestination): boolean {
  return (
    typeof destination.lat === 'number' &&
    Number.isFinite(destination.lat) &&
    typeof destination.lng === 'number' &&
    Number.isFinite(destination.lng)
  );
}

export function hasNavigableDestination(destination: NavDestination): boolean {
  return hasCoordinates(destination) || Boolean(destination.address?.trim());
}

/**
 * The destination string handed to a maps provider. Coordinates win when we
 * have them so the exact pin is preserved; the address is the fallback.
 */
export function navDestinationQuery(destination: NavDestination): string | null {
  if (hasCoordinates(destination)) {
    return `${destination.lat},${destination.lng}`;
  }
  const address = destination.address?.trim();
  return address ? address : null;
}

export function detectNavPlatform(userAgent?: string | null, maxTouchPoints = 0): NavPlatform {
  const ua = userAgent ?? '';
  const isIphoneOrIpad = /iPad|iPhone|iPod/i.test(ua);
  // iPadOS 13+ reports a desktop Safari UA, distinguishable by touch points.
  const isIpadDesktopUa = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const isIos = isIphoneOrIpad || isIpadDesktopUa;
  const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIpadDesktopUa;
  const isAndroid = /Android/i.test(ua);

  return {
    isIos,
    isMac,
    isAndroid,
    supportsAppleMapsApp: isIos || isMac,
  };
}

export function buildAppleMapsUrl(
  destination: NavDestination,
  mode: NavTravelMode = 'driving',
  options: { native?: boolean } = {},
): string | null {
  const query = navDestinationQuery(destination);
  if (!query) return null;

  const params = new URLSearchParams({ daddr: query, dirflg: APPLE_DIRFLG[mode] });
  const label = destination.label?.trim();
  if (label) params.set('q', label);

  const base = options.native ? 'maps://' : 'https://maps.apple.com/';
  return `${base}?${params.toString()}`;
}

export function buildGoogleMapsUrl(
  destination: NavDestination,
  mode: NavTravelMode = 'driving',
  options: { native?: boolean } = {},
): string | null {
  const query = navDestinationQuery(destination);
  if (!query) return null;

  if (options.native) {
    const nativeParams = new URLSearchParams({ daddr: query, directionsmode: mode });
    return `comgooglemaps://?${nativeParams.toString()}`;
  }

  const params = new URLSearchParams({ api: '1', destination: query, travelmode: mode });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildOpenStreetMapUrl(
  destination: NavDestination,
  mode: NavTravelMode = 'driving',
): string | null {
  if (!hasCoordinates(destination)) {
    // OSM directions need coordinates; it has no address geocoding in the URL.
    return null;
  }
  const params = new URLSearchParams({
    engine: OSM_ENGINE[mode],
    route: `;${destination.lat},${destination.lng}`,
  });
  return `https://www.openstreetmap.org/directions?${params.toString()}`;
}

/**
 * The explicit "Open in browser" target: a web maps page, never a native app
 * hand-off initiated by us.
 */
export function buildBrowserMapsUrl(
  destination: NavDestination,
  mode: NavTravelMode = 'driving',
  provider: BrowserMapsProvider = BROWSER_MAPS_PROVIDER,
): string | null {
  if (provider === 'openstreetmap') {
    return buildOpenStreetMapUrl(destination, mode) ?? buildGoogleMapsUrl(destination, mode);
  }
  return buildGoogleMapsUrl(destination, mode);
}

/** Resolve a chooser selection to the URL that should actually be opened. */
export function buildNavUrl(
  choice: NavAppChoice,
  destination: NavDestination,
  mode: NavTravelMode = 'driving',
  platform?: NavPlatform,
): string | null {
  switch (choice) {
    case 'apple':
      // Only attempt the native scheme on Apple platforms; elsewhere the
      // universal link at least renders Apple's web map instead of dead-ending.
      return buildAppleMapsUrl(destination, mode, { native: Boolean(platform?.isIos) });
    case 'google':
      return buildGoogleMapsUrl(destination, mode, { native: Boolean(platform?.isIos) });
    case 'browser':
      return buildBrowserMapsUrl(destination, mode);
    default:
      return null;
  }
}

export interface NavChoiceAvailability {
  choice: NavAppChoice;
  available: boolean;
  /** Why the option is unavailable, surfaced in the chooser UI. */
  unavailableReason?: string;
}

/**
 * Availability per option. Apple Maps is never silently removed or silently
 * substituted: on non-Apple platforms it is shown, disabled, with a reason.
 */
export function navChoiceAvailability(
  destination: NavDestination,
  platform: NavPlatform,
): NavChoiceAvailability[] {
  const navigable = hasNavigableDestination(destination);
  const noTarget = 'No address or coordinates on file for this dispensary.';

  return [
    {
      choice: 'apple',
      available: navigable && platform.supportsAppleMapsApp,
      unavailableReason: !navigable
        ? noTarget
        : platform.supportsAppleMapsApp
          ? undefined
          : 'Apple Maps is not available on this device. Use Google Maps or open in browser.',
    },
    {
      choice: 'google',
      available: navigable,
      unavailableReason: navigable ? undefined : noTarget,
    },
    {
      choice: 'browser',
      available: navigable,
      unavailableReason: navigable ? undefined : noTarget,
    },
  ];
}

type OpenWindow = (url?: string | URL, target?: string, features?: string) => Window | null;

export interface OpenNavTargetOptions {
  mode?: NavTravelMode;
  platform?: NavPlatform;
  openWindow?: OpenWindow;
}

/**
 * Opens the chosen navigation target. Native app schemes are opened in the
 * current tab (a scheme hand-off in a new tab leaves an orphan blank tab);
 * web targets open in a new tab.
 */
export function openNavTarget(
  choice: NavAppChoice,
  destination: NavDestination,
  options: OpenNavTargetOptions = {},
): string | null {
  const mode = options.mode ?? 'driving';
  const platform =
    options.platform ??
    detectNavPlatform(
      globalThis.navigator?.userAgent ?? null,
      globalThis.navigator?.maxTouchPoints ?? 0,
    );

  const url = buildNavUrl(choice, destination, mode, platform);
  if (!url) return null;

  const isNativeScheme = url.startsWith('maps://') || url.startsWith('comgooglemaps://');

  if (isNativeScheme) {
    const currentWindow = globalThis.window;
    if (currentWindow?.location) {
      currentWindow.location.href = url;
      return url;
    }
  }

  const openFn = options.openWindow ?? globalThis.window?.open?.bind(globalThis.window);
  if (!openFn) return null;

  const opened = openFn(url, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
  return url;
}
