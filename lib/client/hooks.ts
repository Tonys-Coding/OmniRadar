"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server rendering and hydration, true afterwards. Gate anything
 * that depends on the browser's clock or timezone (greetings, "today") so the
 * server's UTC time never mismatches the user's local time.
 */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * A string state kept in the URL query (`?key=value`), so filters, ranges, and
 * tabs survive reloads and can be linked. Updates use history.replaceState,
 * which Next.js syncs with useSearchParams without a server round trip.
 * The default value is left out of the URL.
 */
export function useQueryState<T extends string>(
  key: string,
  fallback: T,
  accept: readonly T[] | ((v: string) => boolean) = () => true,
): [T, (value: T) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get(key);
  const ok = (v: string) => (typeof accept === "function" ? accept(v) : (accept as readonly string[]).includes(v));
  const value = raw !== null && ok(raw) ? (raw as T) : fallback;

  const set = useCallback(
    (next: T) => {
      // Read the live URL so two updates in a row don't overwrite each other.
      const sp = new URLSearchParams(window.location.search);
      if (next === fallback || next === "") sp.delete(key);
      else sp.set(key, next);
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [key, fallback, pathname],
  );
  return [value, set];
}
