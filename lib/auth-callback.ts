// The last step of email-link sign-in, kept free of Next so it can be tested
// with any cookie store. The default Supabase email link arrives with `code`
// (PKCE, verifier in a cookie set at sign-in); a custom template can send
// `token_hash` and `type` instead. Both end in a session cookie.
import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { samePath } from "./same-path";

const OTP_TYPES: EmailOtpType[] = ["magiclink", "email", "signup", "invite", "recovery", "email_change"];

/** A same-site path to land on after sign-in, or "/". */
export function safeNext(next: string | null | undefined): string {
  const path = samePath(next);
  if (!path || path === "/sign-in" || path.startsWith("/sign-in?") || path.startsWith("/sign-in#")) return "/";
  return path;
}

/** Exchanges the link for a session and returns the path to redirect to. */
export async function completeSignIn(supabase: SupabaseClient, params: URLSearchParams): Promise<string> {
  const next = safeNext(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    error = { message: "The sign-in link is incomplete." };
  }

  if (error) {
    const back = new URLSearchParams({ error: "That link has expired or was already used. Ask for a new one." });
    if (next !== "/") back.set("next", next);
    return `/sign-in?${back}`;
  }
  return next;
}
