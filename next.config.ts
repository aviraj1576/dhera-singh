// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows larger request bodies for webhook payloads
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;