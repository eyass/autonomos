import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

// Variables the worker needs at runtime. On deploy they are copied from the env file passed
// with --env-file (see the deploy script) into the Trigger.dev environment. Only keys that
// are set locally are synced; nothing else from the file leaves the machine.
const RUNTIME_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "AI_PROVIDER",
  "AI_FAST_MODEL",
  "AI_SMART_MODEL",
  "AI_AGENT_MODEL",
  "AI_MODEL_PRICING",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "COMPOSIO_API_KEY",
  "COMPOSIO_TOOLKIT_VERSIONS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
];

export default defineConfig({
  project: "proj_xytjychoihbtmbxoztql",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 900,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
  },
  build: {
    extensions: [
      syncEnvVars(({ env }) =>
        RUNTIME_ENV.filter((name) => env[name]).map((name) => ({ name, value: env[name]!, isSecret: /KEY|SECRET/.test(name) })),
      ),
    ],
  },
});
