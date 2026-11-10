import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "../../../lib/supabase/server";
import { PublishError, PublishInputError, publishUploadWith, validatePublishInput } from "../../../lib/publish";

const fail = (status: number, error: string, message?: string) => NextResponse.json({ error, message }, { status });

/**
 * POST JSON `{ uploadId, items, lessonDate? }`. Publishes the caller's draft
 * as a lesson. 409 when that upload is already published.
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
    const input = validatePublishInput(body);

    const result = await publishUploadWith({ db }, input);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PublishInputError) return fail(400, "bad_input", err.message);
    if (err instanceof PublishError) {
      if (err.code === "already_published") return fail(409, "already_published");
      if (err.code === "forbidden") return fail(403, "forbidden");
      if (err.code === "not_found") return fail(404, "not_found");
      if (err.code === "profile_unreadable") return fail(500, "publish_failed");
      return fail(400, err.code);
    }
    console.error("publish failed", err);
    return fail(500, "publish_failed");
  }
}
