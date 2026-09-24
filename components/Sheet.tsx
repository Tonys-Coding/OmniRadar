"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Side panel on desktop, bottom sheet on phones. Closes on Escape or backdrop click. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] animate-fade-up overflow-y-auto rounded-t-[32px] bg-canvas p-6 pb-[max(24px,env(safe-area-inset-bottom))] md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[420px] md:rounded-[32px]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-surface hover:bg-line">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
