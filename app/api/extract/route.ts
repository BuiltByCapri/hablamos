import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "../../../lib/supabase/server";
import { getAdminClient } from "../../../lib/supabase/admin";
import { ClaudeCapError, ClaudeUpstreamError } from "../../../lib/claude";
import {
  ExtractAccessError,
  extractUploadWith,
  MAX_UPLOAD_BYTES,
  supportedMediaType,
  type UploadInput,
} from "../../../lib/extract";

// Extraction of a long PDF can take a while.
export const maxDuration = 120;

// Multipart framing around a 10 MB file plus pasted text.
const FORM_OVERHEAD = 64 * 1024;

const fail = (status: number, error: string, extra?: object) => NextResponse.json({ error, ...extra }, { status });

/**
 * POST multipart `studentId`, `text?`, `file?`, `categoryHint?`. Returns
 * `{ uploadId, items }`, reusing the caller's earlier draft of the same
 * content. A material already published comes back as 409.
 */
export async function POST(request: NextRequest) {
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES * 2 + FORM_OVERHEAD) return fail(413, "too_large");

    const db = getServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return fail(401, "not_signed_in");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, "bad_form");
    }
    const studentId = form.get("studentId");
    if (typeof studentId !== "string" || !studentId) return fail(400, "missing_student");

    const rawText = form.get("text");
    const text = typeof rawText === "string" && rawText.trim() ? rawText : undefined;
    const rawFile = form.get("file");
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : undefined;
    if (!text && !file) return fail(400, "no_content");

    if ((text ? Buffer.byteLength(text) : 0) > MAX_UPLOAD_BYTES || (file?.size ?? 0) > MAX_UPLOAD_BYTES) {
      return fail(413, "too_large");
    }

    const input: UploadInput = { studentId, text };
    const hint = form.get("categoryHint");
    if (typeof hint === "string" && hint.trim()) input.categoryHint = hint.trim().slice(0, 200);
    if (file) {
      const mediaType = supportedMediaType(file.type, file.name);
      if (!mediaType) return fail(415, "unsupported_type");
      input.file = { mediaType, bytes: new Uint8Array(await file.arrayBuffer()) };
    }

    const result = await extractUploadWith({ db, admin: getAdminClient(), userId: auth.user.id }, input);
    if (result.status === "published") return fail(409, "already_published", { lessonId: result.lessonId });
    return NextResponse.json({ uploadId: result.uploadId, items: result.items });
  } catch (err) {
    if (err instanceof ExtractAccessError) return fail(403, "forbidden");
    if (err instanceof ClaudeCapError) return fail(429, "daily_limit");
    if (err instanceof ClaudeUpstreamError) return fail(502, "upstream");
    console.error("extract failed", err);
    return fail(500, "extract_failed");
  }
}
