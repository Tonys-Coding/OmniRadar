import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OmniRadar", template: "%s · OmniRadar" },
  description: "Personal finance visibility dashboard",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Phones show the white canvas edge to edge; desktop shows the dark frame.
  // (The login page overrides this with its own dark background.)
  themeColor: [
    { media: "(min-width: 1024px)", color: "#121214" },
    { color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <head>
        {/* Merchant logos in every transaction list come from Plaid's CDN. */}
        <link rel="preconnect" href="https://plaid-merchant-logos.plaid.com" />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
