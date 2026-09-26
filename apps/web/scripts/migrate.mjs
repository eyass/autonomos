// Applies pending Supabase migrations before a production build on Vercel.
//
// The Supabase Vercel integration provides POSTGRES_URL_NON_POOLING to production builds.
// `supabase db push` only applies migrations that are not yet recorded in the database,
// so running it on every production build is safe. Preview and local builds skip it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const dbUrl = process.env.POSTGRES_URL_NON_POOLING;

if (process.env.VERCEL_ENV !== "production" && process.env.FORCE_DB_MIGRATE !== "1") {
  console.log("[migrate] Not a production build, skipping database migrations.");
  process.exit(0);
}
if (!dbUrl) {
  console.log("[migrate] POSTGRES_URL_NON_POOLING is not set, skipping database migrations.");
  process.exit(0);
}

const bin = path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
if (!existsSync(bin)) {
  console.error(`[migrate] Supabase CLI not found at ${bin}.`);
  process.exit(1);
}

console.log("[migrate] Applying pending Supabase migrations...");
try {
  execFileSync(bin, ["db", "push", "--db-url", dbUrl, "--include-all", "--yes"], { cwd: repoRoot, stdio: "inherit" });
} catch (error) {
  // Never print the error object: its message contains the command line, including the
  // database URL and password. The CLI's own output above already explains the failure.
  console.error(`[migrate] Migration failed (exit code ${error?.status ?? "unknown"}). The build is stopped so the app never runs against an outdated schema.`);
  process.exit(1);
}
console.log("[migrate] Database is up to date.");
