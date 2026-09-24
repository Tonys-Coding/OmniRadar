"use client";

import { createContext, Fragment, useCallback, useContext, useEffect } from "react";
import useSWR from "swr";
import { api, refreshAll } from "@/lib/client/api";
import { setShowCents } from "@/lib/format";
import type { Profile, Settings } from "@/lib/settings";

// App-wide access to the user's profile and preferences, with optimistic saves.

type SettingsResponse = { profile: Profile; settings: Settings };
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

type Ctx = {
  profile: Profile;
  settings: Settings;
  /** Save some settings. Resolves when the server has confirmed. */
  update: (patch: DeepPartial<Settings>) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
};

const SettingsContext = createContext<Ctx | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

function merge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as object)) {
    const current = out[k];
    out[k] = v && typeof v === "object" && current && typeof current === "object" ? merge(current, v) : v;
  }
  return out as T;
}

/** Visible name: display name, else the part of the email before "@". */
export function nameOf(profile: Profile) {
  return profile.display_name || profile.email.split("@")[0] || "You";
}

export function SettingsProvider({ initial, children }: { initial: SettingsResponse; children: React.ReactNode }) {
  const { data, mutate } = useSWR<SettingsResponse>("/api/settings", (p: string) => api.get<SettingsResponse>(p), {
    fallbackData: initial,
    revalidateOnFocus: false,
  });
  const current = data ?? initial;

  // Browser-only display preferences.
  setShowCents(current.settings.show_cents);
  useEffect(() => {
    document.documentElement.classList.toggle("privacy", current.settings.privacy_mode);
  }, [current.settings.privacy_mode]);

  const update = useCallback(
    async (patch: DeepPartial<Settings>) => {
      const optimistic = { ...current, settings: merge(current.settings, patch) };
      await mutate(
        async () => {
          const saved = await api.patch<SettingsResponse>("/api/settings", { settings: patch });
          return saved;
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
      );
      // Week start and budget change server-computed numbers.
      if ("week_start" in patch || "monthly_budget" in patch || "alerts" in patch) await refreshAll();
    },
    [current, mutate],
  );

  const updateDisplayName = useCallback(
    async (name: string) => {
      await mutate(async () => api.patch<SettingsResponse>("/api/settings", { display_name: name }), {
        optimisticData: { ...current, profile: { ...current.profile, display_name: name } },
        rollbackOnError: true,
        revalidate: false,
      });
    },
    [current, mutate],
  );

  return (
    <SettingsContext.Provider value={{ profile: current.profile, settings: current.settings, update, updateDisplayName }}>
      {/* Remount on "show cents" so every formatted amount re-renders (SWR cache survives). */}
      <Fragment key={current.settings.show_cents ? "cents" : "whole"}>{children}</Fragment>
    </SettingsContext.Provider>
  );
}
