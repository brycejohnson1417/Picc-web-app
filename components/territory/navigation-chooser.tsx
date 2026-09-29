'use client';

import { useEffect, useMemo, useState } from 'react';
import { Apple, ExternalLink, MapPin, Navigation, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  detectNavPlatform,
  hasNavigableDestination,
  navChoiceAvailability,
  openNavTarget,
  type NavAppChoice,
  type NavDestination,
  type NavPlatform,
  type NavTravelMode,
} from '@/lib/territory/nav-links';

const CHOICE_LABELS: Record<NavAppChoice, string> = {
  apple: 'Apple Maps',
  google: 'Google Maps',
  browser: 'Open in browser',
};

const CHOICE_HINTS: Record<NavAppChoice, string> = {
  apple: 'Opens the Apple Maps app',
  google: 'Opens the Google Maps app',
  browser: 'Opens web directions in a new tab',
};

const CHOICE_ORDER: NavAppChoice[] = ['apple', 'google', 'browser'];

interface NavigationChooserProps {
  open: boolean;
  destination: NavDestination;
  onClose: () => void;
  travelMode?: NavTravelMode;
  /** Injectable for tests and for SSR-safe rendering. */
  platform?: NavPlatform;
  onChoose?: (choice: NavAppChoice, url: string | null) => void;
}

function ChoiceIcon({ choice }: { choice: NavAppChoice }) {
  if (choice === 'apple') return <Apple className="h-5 w-5" aria-hidden="true" />;
  if (choice === 'google') return <Navigation className="h-5 w-5" aria-hidden="true" />;
  return <ExternalLink className="h-5 w-5" aria-hidden="true" />;
}

export function NavigationChooser({
  open,
  destination,
  onClose,
  travelMode = 'driving',
  platform,
  onChoose,
}: NavigationChooserProps) {
  // Detected on the client only: user agent is not available during SSR, and
  // guessing there would risk hiding Apple Maps from an Apple device.
  const [detected, setDetected] = useState<NavPlatform | null>(platform ?? null);

  useEffect(() => {
    if (platform) {
      setDetected(platform);
      return;
    }
    setDetected(detectNavPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints));
  }, [platform]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const options = useMemo(() => {
    const resolved =
      detected ?? ({ isIos: false, isMac: false, isAndroid: false, supportsAppleMapsApp: false } as NavPlatform);
    const availability = navChoiceAvailability(destination, resolved);
    return CHOICE_ORDER.map((choice) => availability.find((entry) => entry.choice === choice)!);
  }, [destination, detected]);

  if (!open) return null;

  const addressLine = destination.address?.trim() || destination.label?.trim() || 'Selected dispensary';
  const navigable = hasNavigableDestination(destination);

  function handleChoose(choice: NavAppChoice) {
    const url = openNavTarget(choice, destination, {
      mode: travelMode,
      platform: detected ?? undefined,
    });
    onChoose?.(choice, url);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/45 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a maps app for directions"
        className="w-full max-w-[420px] rounded-t-2xl bg-[#1d1f24] p-4 text-white shadow-[0_-2px_16px_rgba(0,0,0,0.45)] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight">Get directions</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-[#b6bac3]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{addressLine}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!navigable ? (
          <p className="rounded-lg bg-[#3a2a12] px-3 py-2 text-[12px] text-[#f1cc78]">
            No address or coordinates on file for this dispensary, so directions cannot be opened.
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {options.map((option) => (
            <li key={option.choice}>
              <button
                type="button"
                disabled={!option.available}
                aria-disabled={!option.available}
                onClick={() => handleChoose(option.choice)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition',
                  option.available
                    ? 'border-[#3a3e48] bg-[#25282f] text-white hover:bg-[#2e323a]'
                    : 'cursor-not-allowed border-[#2a2d34] bg-[#1f2228] text-white/40',
                )}
              >
                <ChoiceIcon choice={option.choice} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{CHOICE_LABELS[option.choice]}</span>
                  <span className="block truncate text-[12px] text-current opacity-70">
                    {option.available ? CHOICE_HINTS[option.choice] : option.unavailableReason}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
