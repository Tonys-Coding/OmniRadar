import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plaid's SDK is Node-only; keep it out of any bundling surprises.
  serverExternalPackages: ["plaid"],
  poweredByHeader: false,
};

export default nextConfig;
