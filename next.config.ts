import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build enxuta para o container da VPS, como no CRM (ADR 0001).
  output: 'standalone',
};

export default nextConfig;
