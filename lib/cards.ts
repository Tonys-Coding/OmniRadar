import type { CardNetwork } from "@/lib/supabase/database.types";

// Pure helpers for the "My Cards" view: which network logo to draw, what color
// the card is, and which numbers go on it. Plaid gives us the account's last 4
// digits, balances, and the bank; it never exposes expiry dates, CVVs, full
// numbers, or the card network, so the network is guessed unless the owner
// picks one.

export const NETWORKS: { value: CardNetwork; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "discover", label: "Discover" },
];

type Bank = { match: RegExp; color: string; network: CardNetwork };

/**
 * Brand colors and usual debit/credit network for common US banks. Checked
 * before Plaid's color so the big banks look right and stay distinct.
 */
const BANKS: Bank[] = [
  { match: /bank of america/i, color: "#012169", network: "visa" },
  { match: /capital one/i, color: "#d03027", network: "mastercard" },
  { match: /\bchase\b/i, color: "#117aca", network: "visa" },
  { match: /wells fargo/i, color: "#b31b1b", network: "visa" },
  { match: /\bciti(bank)?\b/i, color: "#056dae", network: "mastercard" },
  { match: /american express|amex/i, color: "#006fcf", network: "amex" },
  { match: /discover/i, color: "#e55c00", network: "discover" },
  { match: /\bu\.?s\.? bank\b/i, color: "#0c2074", network: "visa" },
  { match: /\bally\b/i, color: "#650360", network: "mastercard" },
  { match: /navy federal/i, color: "#003b71", network: "visa" },
  { match: /\busaa\b/i, color: "#12395b", network: "visa" },
  { match: /\bpnc\b/i, color: "#d9531e", network: "visa" },
  { match: /\btd bank\b/i, color: "#2a8a3e", network: "visa" },
];

const bankFor = (institution: string | null | undefined) =>
  institution ? BANKS.find((b) => b.match.test(institution)) : undefined;

type CardAccount = {
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  card_network?: CardNetwork | null;
};

/** Credit cards and checking-style accounts have a card; savings, CDs, and loans don't. */
export function hasCard(a: Pick<CardAccount, "type" | "subtype">) {
  if (a.type === "credit") return true;
  if (a.type !== "depository") return false;
  return ["checking", "prepaid", "cash management", "paypal"].includes(a.subtype ?? "checking");
}

/**
 * The network logo to draw. The owner's choice wins; then clues in the
 * account's name ("Quicksilver Mastercard", "Visa Signature"); then the bank's
 * usual network. Savings accounts have no card, so no network.
 */
export function detectNetwork(a: CardAccount, institution: string | null | undefined): { network: CardNetwork | null; guessed: boolean } {
  if (a.card_network) return { network: a.card_network, guessed: false };
  if (!hasCard(a)) return { network: null, guessed: false };
  const text = `${a.official_name ?? ""} ${a.name}`;
  if (/\bvisa\b/i.test(text)) return { network: "visa", guessed: true };
  if (/master\s?card|world elite/i.test(text)) return { network: "mastercard", guessed: true };
  if (/american express|\bamex\b/i.test(text)) return { network: "amex", guessed: true };
  if (/discover/i.test(text)) return { network: "discover", guessed: true };
  return { network: bankFor(institution)?.network ?? null, guessed: true };
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

/** Mix `hex` toward `target` by `t` (0..1). */
export function mix(hex: string, target: string, t: number) {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex(a.map((c, i) => c + (b[i]! - c) * t));
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Darken until white text on it reaches at least `ratio`:1 contrast. */
export function readableBase(hex: string, ratio = 4.5) {
  let color = hex;
  for (let i = 0; i < 30 && 1.05 / (luminance(color) + 0.05) < ratio; i++) color = mix(color, "#000000", 0.08);
  return color;
}

export const INK_CARD = { base: "#121214", from: "#2a2a2e", to: "#0b0b0d" };

/**
 * The card's background: the bank's color (curated, then Plaid's), darkened
 * enough for white text, as a two-stop gradient. Unknown banks get the ink card.
 */
export function cardColors(institution: string | null | undefined, plaidColor: string | null | undefined) {
  const raw = bankFor(institution)?.color ?? (plaidColor && /^#[0-9a-f]{6}$/i.test(plaidColor) ? plaidColor : null);
  if (!raw) return INK_CARD;
  // Headroom above 4.5:1 so the lighter corner of the gradient still passes.
  const base = readableBase(raw.toLowerCase(), 6);
  return { base, from: mix(base, "#ffffff", 0.1), to: mix(base, "#000000", 0.38) };
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

type Figures = {
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  type: string;
};

/** The two numbers printed where a real card has EXP and CVV, plus credit used. */
export function cardFigures(a: Figures) {
  const balance = a.current_balance ?? 0;
  if (a.type === "credit") {
    const limit = a.credit_limit ?? (a.available_balance !== null ? balance + a.available_balance : null);
    return {
      primary: { label: "Balance", value: balance },
      secondary: limit ? { label: "Limit", value: limit } : null,
      utilization: limit ? Math.max(0, balance) / limit : null,
    };
  }
  const available = a.type === "depository" && a.available_balance !== null && a.available_balance !== balance ? a.available_balance : null;
  return {
    primary: { label: "Balance", value: balance },
    secondary: available !== null ? { label: "Available", value: available } : null,
    utilization: null,
  };
}

/** "•••• •••• 6782" */
export const maskedNumber = (mask: string | null) => `•••• •••• ${mask ?? "••••"}`;
