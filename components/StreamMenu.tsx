"use client";

import { EllipsisVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, refreshAll } from "@/lib/client/api";
import type { Stream } from "@/lib/client/types";
import type { StreamKind } from "@/lib/supabase/database.types";

const KIND_LABEL: Record<StreamKind, string> = {
  subscription: "Subscription",
  bill: "Bill",
  income: "Income",
  transfer: "Transfer",
  other: "Other",
};

/** Fix a misclassified recurring stream: change its type, hide it, or restore it. */
export function StreamMenu({ stream }: { stream: Stream }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function update(body: { kind_override?: StreamKind | null; is_ignored?: boolean }) {
    setBusy(true);
    try {
      await api.patch(`/api/recurring/${stream.id}`, body);
      await refreshAll();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const kinds = (stream.direction === "outflow" ? ["subscription", "bill", "other"] : ["income", "transfer", "other"]) as StreamKind[];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Options for ${stream.description}`}
        aria-expanded={open}
        disabled={busy}
        className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
      >
        <EllipsisVertical className="size-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-56 animate-fade-up rounded-3xl border border-line bg-canvas p-2 shadow-xl shadow-black/10">
          <p className="px-3 pt-1.5 pb-1 text-xs text-muted">Treat as</p>
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => update({ kind_override: k === stream.kind ? null : k })}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm hover:bg-surface"
            >
              {KIND_LABEL[k]}
              {stream.effective_kind === k ? <span className="text-brand">✓</span> : null}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button
            onClick={() => update({ is_ignored: !stream.is_ignored })}
            className="w-full rounded-2xl px-3 py-2 text-left text-sm hover:bg-surface"
          >
            {stream.is_ignored ? "Show again" : "Hide, not recurring"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
