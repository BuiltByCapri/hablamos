import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "../../../lib/supabase/server";
import { completeSignIn } from "../../../lib/auth-callback";

// Where the email link lands. Exchanges it for a session cookie, then sends
// the user on to where they were going.
export async function GET(request: NextRequest) {
  const target = await completeSignIn(getServerClient(), request.nextUrl.searchParams);
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
