import { defineConfig } from "@trigger.dev/sdk";

// TRIGGER_PROJECT_REF is your Trigger.dev project ref (proj_...), from the project settings page.
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 900,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
  },
});
