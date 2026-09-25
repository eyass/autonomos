import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@autonomos/db";

// User-scoped client. All reads through it are subject to row level security.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}
