import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One env file for the whole monorepo: <repo>/.env.local
loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  transpilePackages: ["@autonomos/schemas", "@autonomos/ai", "@autonomos/integrations", "@autonomos/agents", "@autonomos/db", "@autonomos/workflows"],
  serverExternalPackages: ["@composio/core", "@trigger.dev/sdk"],
  poweredByHeader: false,
  // Addresses people type or older links use; each lands on the page that answers it.
  async redirects() {
    return [
      { source: "/pricing", destination: "/#pricing", permanent: false },
      { source: "/about", destination: "/#how-it-works", permanent: false },
      { source: "/blog", destination: "/docs", permanent: false },
      // Help lives in the docs for good: a permanent (308) redirect, answered before any page renders.
      { source: "/help", destination: "/docs", permanent: true },
      { source: "/help/:path*", destination: "/docs", permanent: true },
      { source: "/support", destination: "/docs", permanent: true },
      { source: "/legal", destination: "/terms", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
