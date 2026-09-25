import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import { createServiceClient } from "../src";

export const service = () => createServiceClient();

export async function signUp(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email, password: "correct-horse-battery", options: { data: { first_name: "Test", last_name: "User" } } });
  if (error || !data.user) throw error ?? new Error("no user");
  return { client, userId: data.user.id };
}

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
