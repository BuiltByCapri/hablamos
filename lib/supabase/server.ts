import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Tables } from "../db-types";

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  return { url, anonKey };
}

/** The signed-in user's client for server components, actions and route handlers. Goes through RLS. */
export function getServerClient(): SupabaseClient<Database> {
  const { url, anonKey } = supabaseEnv();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: async () => (await cookies()).getAll(),
      setAll: async (toSet) => {
        const store = await cookies();
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Server components cannot set cookies. proxy.ts refreshes the
          // session on every request, so nothing is lost here.
        }
      },
    },
  });
}

/**
 * This app's public origin, for links in emails. Production requires APP_URL:
 * the Host and X-Forwarded-Host headers are set by whoever sends the request,
 * so building a sign-in or invite link from them lets a caller point it at
 * their own site. The header fallback is for development and tests only.
 */
export async function getAppUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL must be set in production");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type Profile = Tables<"profiles">;

/**
 * The signed-in user and their profile, or a redirect to sign-in that comes
 * back to `next` afterwards. The profile row is created by the
 * on_auth_user_created trigger when the auth user is.
 */
export async function requireUser(next?: string): Promise<{ user: User; profile: Profile }> {
  // Per-user, so never prerendered at build time.
  await connection();
  const supabase = getServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  if (error || !profile) throw new Error(`No profile for the signed-in user: ${error?.message}`);
  return { user: data.user, profile };
}
