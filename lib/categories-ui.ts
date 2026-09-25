// Labels and colors for Plaid personal finance categories (v2 primaries).

export const CATEGORY_LABEL: Record<string, string> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  LOAN_PAYMENTS: "Loan payments",
  LOAN_DISBURSEMENTS: "Loan disbursements",
  BANK_FEES: "Bank fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Food & drink",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Home",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal care",
  GENERAL_SERVICES: "Services",
  GOVERNMENT_AND_NON_PROFIT: "Taxes & giving",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Rent & utilities",
  OTHER: "Other",
  UNCATEGORIZED: "Uncategorized",
};

export const categoryLabel = (c: string | null | undefined) =>
  c ? (CATEGORY_LABEL[c] ?? c.toLowerCase().replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase())) : "Uncategorized";

/** "FOOD_AND_DRINK_COFFEE" -> "Coffee" */
export function detailedLabel(primary: string | null, detailed: string | null): string {
  if (!detailed) return categoryLabel(primary);
  const rest = primary && detailed.startsWith(primary + "_") ? detailed.slice(primary.length + 1) : detailed;
  return rest.toLowerCase().replace(/_/g, " ").replace(/\band\b/g, "&").replace(/^\w/, (x) => x.toUpperCase());
}

// The brand palette (teals from the logo, slate, ink) extended with a few
// quiet accents so eight categories stay distinguishable in charts.
export const SERIES_COLORS = [
  "#14A1A5", // brand teal
  "#A6E3E4", // brand soft
  "#6E7A96", // slate
  "#0A6568", // brand deep
  "#121214", // ink
  "#C7CBD6", // mist
  "#8C9BC4", // periwinkle
  "#D9B38C", // sand
];

/** Stable color per category, by rank in the current list. */
export const colorAt = (index: number) => SERIES_COLORS[index % SERIES_COLORS.length]!;
