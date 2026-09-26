"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { initials, moneyParts } from "@/lib/format";

// Small shared building blocks that follow the OmniRadar design system.

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

export function Card({ className, children, dark }: { className?: string; children: React.ReactNode; dark?: boolean }) {
  return <section className={cx(dark ? "card-dark" : "card", "relative min-w-0 p-5 sm:p-6", className)}>{children}</section>;
}

export function CardHeader({
  title,
  icon,
  action,
  className,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2.5 text-[17px] font-medium sm:text-lg">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

/** Rounded-square outline icon used in stat card titles (matches the reference). */
export function IconChip({ children }: { children: React.ReactNode }) {
  return <span className="grid size-7 place-items-center rounded-lg border-[1.5px] border-current/80 [&>svg]:size-4">{children}</span>;
}

export function Pill({ children, tone = "dark", className }: { children: React.ReactNode; tone?: "dark" | "light" | "brand" | "danger"; className?: string }) {
  const tones = {
    dark: "bg-ink text-white",
    light: "bg-surface text-ink",
    brand: "bg-brand-pale text-brand-deep",
    danger: "bg-danger/10 text-danger",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular", tones[tone], className)}>{children}</span>;
}

/** $78,162 with smaller .12 */
export function BigMoney({ value, className, centsClassName }: { value: number; className?: string; centsClassName?: string }) {
  const [whole, cents] = moneyParts(value);
  return (
    <span className={cx("tabular font-medium tracking-tight", className)}>
      {whole}
      <span className={cx("text-[0.6em] opacity-80", centsClassName)}>{cents}</span>
    </span>
  );
}

/** A row of mutually exclusive options (a toggle group of pressed buttons). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  dark,
  size = "md",
  label,
}: {
  options: readonly T[] | { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  dark?: boolean;
  size?: "sm" | "md";
  /** What the options choose between, for screen readers ("Chart range"). */
  label?: string;
}) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className={cx("inline-flex shrink-0 rounded-full p-1", dark ? "bg-white/8" : "bg-surface")} role="group" aria-label={label}>
      {items.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm sm:px-3.5",
            o.value === value
              ? dark
                ? "bg-white text-ink"
                : "bg-ink text-white"
              : dark
                ? "text-white/70 hover:text-white"
                : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "brand" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variants = {
    primary: "bg-ink text-white hover:bg-ink-3",
    brand: "bg-brand-ink text-white hover:bg-brand-deep",
    secondary: "bg-surface text-ink hover:bg-line",
    ghost: "text-muted hover:text-ink hover:bg-surface",
    danger: "bg-danger/10 text-danger hover:bg-danger/15",
  };
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-13 px-6 text-[15px]" };
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-50 [&>svg]:size-4",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <LoaderCircle className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-brand" : "bg-line",
      )}
    >
      <span className={cx("absolute size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-5 animate-spin text-muted", className)} />;
}

/** Merchant / institution logo with an initials fallback. */
export function Logo({
  src,
  name,
  size = 44,
  dark,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  dark?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote merchant logos of unknown size
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        onError={() => setFailed(true)}
        className={cx("shrink-0 rounded-full bg-white object-cover ring-1 ring-line", className)}
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.34 }}
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-medium",
        dark ? "bg-white/10 text-white" : "bg-surface text-ink",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="grid size-12 place-items-center rounded-full bg-surface text-muted [&>svg]:size-5">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong loading this.";
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-danger/8 px-4 py-3 text-sm text-danger">
      <span>
        {message}
        {onRetry ? " Check your connection, then retry." : " Refresh the page to try again."}
      </span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">
          Retry
        </button>
      ) : null}
    </div>
  );
}
