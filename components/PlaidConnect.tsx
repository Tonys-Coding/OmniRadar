"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui";
import { api, refreshAll } from "@/lib/client/api";
import type { ItemsResponse } from "@/lib/client/types";

// Opens Plaid Link to connect a new bank, or (with itemId) to repair an
// existing connection. Handles OAuth banks (BoA, Capital One, ...) that bounce
// through /oauth-return when a redirect URI is configured.

const STORAGE_KEY = "omniradar.plaidLink";
type Pending = { token: string; itemId?: string };

export function savePending(p: Pending) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Private mode: OAuth return just won't auto-resume.
  }
}

export function loadPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Poll until a freshly linked bank has finished its first import. */
async function waitForFirstSync(itemId: string, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { items } = await api.get<ItemsResponse>("/api/items");
    if (items.find((i) => i.id === itemId)?.last_synced_at) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export type LinkOutcome = { kind: "linked"; institution: string | null } | { kind: "repaired" } | { kind: "error"; message: string };

/** Headless launcher: mounts Plaid Link with a token and opens it when ready. */
export function LinkLauncher({
  token,
  itemId,
  receivedRedirectUri,
  onDone,
  onStatus,
}: {
  token: string;
  itemId?: string;
  receivedRedirectUri?: string;
  onDone: (outcome: LinkOutcome | null) => void;
  onStatus?: (status: string) => void;
}) {
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      clearPending();
      try {
        if (itemId) {
          onStatus?.("Refreshing your data…");
          await api.post("/api/sync", { item_id: itemId });
          await refreshAll();
          onDone({ kind: "repaired" });
          return;
        }
        onStatus?.(`Connecting ${metadata.institution?.name ?? "your bank"}…`);
        const { item } = await api.post<{ item: { id: string; institution_name: string | null } }>("/api/plaid/exchange", {
          public_token: publicToken,
        });
        onStatus?.(`Importing transactions from ${item.institution_name ?? "your bank"}…`);
        await waitForFirstSync(item.id);
        await refreshAll();
        onDone({ kind: "linked", institution: item.institution_name });
      } catch (error) {
        onDone({ kind: "error", message: error instanceof Error ? error.message : "Could not connect" });
      }
    },
    [itemId, onDone, onStatus],
  );

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri,
    onSuccess,
    onExit: (err) => {
      clearPending();
      onDone(err ? { kind: "error", message: err.display_message ?? err.error_message ?? "Connection cancelled" } : null);
    },
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return null;
}

/** Button that fetches a Link token and launches Plaid Link. */
export function ConnectBankButton({
  itemId,
  children,
  variant = "primary",
  size = "md",
  onOutcome,
  onStatus,
}: {
  itemId?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "brand";
  size?: "sm" | "md" | "lg";
  onOutcome?: (outcome: LinkOutcome | null) => void;
  onStatus?: (status: string | null) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const { link_token } = await api.post<{ link_token: string }>("/api/plaid/link-token", itemId ? { item_id: itemId } : {});
      savePending({ token: link_token, itemId });
      setToken(link_token);
    } catch (error) {
      setBusy(false);
      onOutcome?.({ kind: "error", message: error instanceof Error ? error.message : "Could not start Plaid" });
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={start} loading={busy}>
        {children}
      </Button>
      {token ? (
        <LinkLauncher
          token={token}
          itemId={itemId}
          onStatus={(s) => onStatus?.(s)}
          onDone={(outcome) => {
            setToken(null);
            setBusy(false);
            onStatus?.(null);
            onOutcome?.(outcome);
          }}
        />
      ) : null}
    </>
  );
}
