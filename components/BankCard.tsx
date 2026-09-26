"use client";

import { Landmark, Nfc, PiggyBank } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { cx } from "@/components/ui";
import { maskedNumber } from "@/lib/cards";
import type { BankCardData } from "@/lib/client/types";
import { money, percent, timeAgo } from "@/lib/format";
import type { CardNetwork } from "@/lib/supabase/database.types";

// A bank account drawn as a payment card, after the "My Cards" reference.
// Where a real card shows EXP and CVV we print balances: OmniRadar never
// receives (and must never store) expiry dates or security codes.

function Mastercard({ className }: { className?: string }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 38 24" className={className} role="img" aria-label="Mastercard">
      <defs>
        <clipPath id={clip}>
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#eb001b" />
      <circle cx="26" cy="12" r="11" fill="#f79e1b" />
      <circle cx="26" cy="12" r="11" fill="#ff5f00" clipPath={`url(#${clip})`} />
    </svg>
  );
}

function Visa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 20" className={className} role="img" aria-label="Visa">
      <text x="28" y="17" textAnchor="middle" textLength="52" lengthAdjust="spacingAndGlyphs" fill="currentColor" fontSize="20" fontWeight="800" fontStyle="italic">
        VISA
      </text>
    </svg>
  );
}

function Amex({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 24" className={className} role="img" aria-label="American Express">
      <rect width="44" height="24" rx="4" fill="#ffffff" />
      <text x="22" y="16.5" textAnchor="middle" textLength="34" lengthAdjust="spacingAndGlyphs" fill="#006fcf" fontSize="11.5" fontWeight="800">
        AMEX
      </text>
    </svg>
  );
}

function Discover({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 76 18" className={className} role="img" aria-label="Discover">
      <text x="0" y="14" textLength="34" lengthAdjust="spacingAndGlyphs" fill="currentColor" fontSize="14" fontWeight="700">
        DISC
      </text>
      <circle cx="42" cy="9" r="6" fill="#ff6000" />
      <text x="50" y="14" textLength="26" lengthAdjust="spacingAndGlyphs" fill="currentColor" fontSize="14" fontWeight="700">
        VER
      </text>
    </svg>
  );
}

export function NetworkLogo({ network, className }: { network: CardNetwork; className?: string }) {
  switch (network) {
    case "mastercard":
      return <Mastercard className={cx("h-6", className)} />;
    case "visa":
      return <Visa className={cx("h-[18px]", className)} />;
    case "amex":
      return <Amex className={cx("h-6", className)} />;
    case "discover":
      return <Discover className={cx("h-4", className)} />;
  }
}

export function cardStatus(card: Pick<BankCardData, "institution" | "is_hidden">) {
  const status = card.institution?.status ?? "good";
  if (status === "login_required" || status === "pending_expiration" || status === "revoked") {
    return { label: "Reconnect", tone: "warn" as const };
  }
  if (status === "error") return { label: "Sync issue", tone: "warn" as const };
  if (card.is_hidden) return { label: "Hidden", tone: "muted" as const };
  return { label: "Active", tone: "ok" as const };
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <p className="text-[11px] leading-none text-white/70">{label}</p>
      <p className="mt-1.5 truncate text-[15px] leading-none font-medium tabular">{value}</p>
    </div>
  );
}

export function BankCard({
  card,
  href,
  onSelect,
  selected,
  className,
}: {
  card: BankCardData;
  /** Navigate on click (dashboard). */
  href?: string;
  /** Or select on click (cards page). */
  onSelect?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const status = cardStatus(card);
  const { primary, secondary, utilization } = card.figures;
  const bank = card.institution?.name ?? "Bank";
  const Icon = card.has_card ? Nfc : card.type === "depository" ? PiggyBank : Landmark;
  const label = `${bank} ${card.name}${card.mask ? ` ending in ${card.mask}` : ""}, ${primary.label.toLowerCase()} ${money(primary.value)}, ${status.label}`;

  const body = (
    <>
      {/* Texture: soft light blocks, like the reference card's pixel pattern. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute top-[14%] left-[46%] size-[18%] rounded-[3px] bg-white/[0.045]" />
        <span className="absolute top-[32%] left-[58%] size-[22%] rounded-[3px] bg-white/[0.035]" />
        <span className="absolute top-[4%] left-[64%] size-[14%] rounded-[3px] bg-white/[0.03]" />
        <span className="absolute top-[54%] left-[40%] size-[12%] rounded-[3px] bg-black/[0.07]" />
        <span className="absolute -top-1/3 -right-1/4 size-[80%] rounded-full bg-white/[0.07] blur-2xl" />
      </span>

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon className="size-5 text-white/85" strokeWidth={1.8} aria-hidden />
          <span
            className={cx(
              "rounded-full px-2.5 py-1 text-xs leading-none font-medium",
              status.tone === "ok" && "bg-white text-ink",
              status.tone === "warn" && "bg-amber-300 text-ink",
              status.tone === "muted" && "bg-white/20 text-white",
            )}
          >
            {status.label}
          </span>
        </div>
        {card.network ? (
          <NetworkLogo network={card.network} className="shrink-0 text-white" />
        ) : card.institution?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- base64 bank logo from Plaid
          <img src={card.institution.logo} alt="" width={28} height={28} className="size-7 shrink-0 rounded-full bg-white object-contain p-0.5" />
        ) : null}
      </div>

      <div className="relative min-w-0">
        <p className="truncate text-[15px] leading-tight font-medium">{card.name}</p>
        <p className="mt-0.5 truncate text-xs text-white/70">
          {bank} · Synced {timeAgo(card.institution?.last_synced_at ?? null)}
        </p>
        {utilization !== null ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className={cx("h-full rounded-full", utilization > 0.3 ? "bg-amber-300" : "bg-brand-bright")}
                style={{ width: `${Math.min(100, utilization * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-white/70 tabular">{percent(utilization)} used</span>
          </div>
        ) : null}
      </div>

      <div className="relative flex items-end gap-4">
        <Figure
          label={card.type === "credit" ? "Card number" : "Account number"}
          value={maskedNumber(card.mask)}
          className="flex-1 [&_p:last-child]:tracking-wide [&_p:last-child]:tabular-nums"
        />
        <Figure label={primary.label} value={money(primary.value)} className="text-right" />
        {secondary ? <Figure label={secondary.label} value={money(secondary.value)} className="text-right max-[360px]:hidden" /> : null}
      </div>
    </>
  );

  const classes = cx(
    "relative flex aspect-[1.586/1] min-w-0 flex-col justify-between overflow-hidden rounded-[22px] p-4 text-left text-white shadow-lg shadow-black/10 transition sm:p-5",
    (href || onSelect) && "hover:-translate-y-0.5 hover:shadow-xl motion-reduce:hover:translate-y-0 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
    selected && "ring-2 ring-brand ring-offset-2 ring-offset-canvas",
    card.is_hidden && !selected && "opacity-60",
    className,
  );
  const style = { backgroundImage: `linear-gradient(135deg, ${card.colors.from}, ${card.colors.to})` };

  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes} style={style}>
        {body}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} aria-label={label} aria-pressed={selected} className={classes} style={style}>
        {body}
      </button>
    );
  }
  return (
    <article aria-label={label} className={classes} style={style}>
      {body}
    </article>
  );
}
