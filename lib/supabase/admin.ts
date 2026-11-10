import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db-types";

let client: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses RLS, so it is for the writes the schema routes
 * through the server (activating invites, deleting accounts, notifications,
 * usage counts) and never reaches the browser.
 */
export function getAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") throw new Error("getAdminClient is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client ??= createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
