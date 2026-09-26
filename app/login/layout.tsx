import type { Viewport } from "next";

export const viewport: Viewport = { themeColor: "#121214" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
