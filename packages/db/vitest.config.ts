import { defineConfig } from "vitest/config";

// Unit tests only by default; integration tests need a running Supabase (pnpm test:integration).
export default defineConfig({ test: { include: process.env.INTEGRATION ? ["test/**/*.test.ts"] : ["src/**/*.test.ts"], testTimeout: 30_000 } });
