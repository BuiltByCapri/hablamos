import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "../../../lib/supabase/server";
import {
  finishSessionWith,
  markAnsweredWith,
  markSpokeWith,
  recordResultWith,
  SessionError,
  SessionInputError,
  startSessionWith,
  validateSessionInput,
} from "../../../lib/sessions";

const fail = (status: number, error: string, message?: string) => NextResponse.json({ error, message }, { status });

/**
 * POST JSON `{ action: 'start', mode }`, `{ action: 'result', sessionId, itemId, outcome }`
 * `{ action: 'spoke', sessionId }`, `{ action: 'answered', sessionId }` (a quiz question with no item)
 * or `{ action: 'finish', sessionId }`. Always acts as the signed-in student.
 */
export async function POST(request: NextRequest) {
  try {
    const db = getServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return fail(401, "not_signed_in");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, "bad_json");
    }
    const input = validateSessionInput(body);

    if (input.action === "start") return NextResponse.json({ sessionId: await startSessionWith({ db }, input.mode) });
    if (input.action === "result") {
      await recordResultWith({ db }, input.sessionId, input.itemId, input.outcome);
      return NextResponse.json({ ok: true });
    }
    if (input.action === "spoke") {
      await markSpokeWith({ db }, input.sessionId);
      return NextResponse.json({ ok: true });
    }
    if (input.action === "answered") {
      await markAnsweredWith({ db }, input.sessionId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await finishSessionWith({ db }, input.sessionId));
  } catch (err) {
    if (err instanceof SessionInputError) return fail(400, "bad_input", err.message);
    if (err instanceof SessionError) {
      if (err.code === "not_signed_in") return fail(401, "not_signed_in");
      if (err.code === "not_found") return fail(404, "not_found");
      if (err.code === "finished") return fail(409, "session_finished");
      return fail(400, "bad_input", err.message);
    }
    console.error("sessions failed", err);
    return fail(500, "sessions_failed");
  }
}
