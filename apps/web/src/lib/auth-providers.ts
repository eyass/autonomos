import "server-only";

// The sign-in providers offered on the login and signup pages, in display order.
export const AUTH_PROVIDERS = ["google", "azure", "github"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// Only providers switched on in the Supabase project are shown, so no button leads to an error.
// Read from Supabase's public auth settings, cached for five minutes. If they cannot be read,
// Google (the long-standing default) is shown.
export async function enabledAuthProviders(): Promise<AuthProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 300 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(String(res.status));
    const { external } = (await res.json()) as { external?: Record<string, boolean> };
    return AUTH_PROVIDERS.filter((p) => external?.[p]);
  } catch {
    return ["google"];
  }
}
