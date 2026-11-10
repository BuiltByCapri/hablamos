// The extraction cache and upload rows against the real schema and RLS, with
// Claude mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";
import { contentHash, EXTRACT_VERSION, ExtractAccessError, extractUploadWith, type UploadInput } from "../../lib/extract";
import { ClaudeUpstreamError, type ClaudeArgs } from "../../lib/claude";

type User = { id: string; client: SupabaseClient };
let student: User;
let tutor: User;
let endedTutor: User;
let stranger: User;
let topicId: string;

const modelItems = [
  { kind: "word", text: "uno", meaning: "one", example: null, explanation: null, existing_topic_id: "", topic_name: "Numbers" },
  { kind: "grammar", text: "ser vs estar", meaning: "to be", example: "Soy alta.", explanation: "Ser for traits.", existing_topic_id: null, topic_name: "Verbs" },
  { kind: "phrase", text: "¿cuánto cuesta?", meaning: "how much is it?", example: null, explanation: null, existing_topic_id: null, topic_name: "Shopping" },
];
const call = vi.fn(async (_args: ClaudeArgs) => ({ items: modelItems.map((i) => ({ ...i, existing_topic_id: i.topic_name === "Numbers" ? topicId : null })) }) as never);

const ctx = (u: User) => ({ db: u.client, admin: admin(), userId: u.id });
let n = 0;
const fresh = (): UploadInput => ({ studentId: student.id, text: `notes ${Date.now()} ${n++}: uno, ser vs estar` });

beforeAll(async () => {
  student = await makeUser(uniqueEmail("ex-student"));
  tutor = await makeUser(uniqueEmail("ex-tutor"), { tutor: true });
  endedTutor = await makeUser(uniqueEmail("ex-ended"), { tutor: true });
  stranger = await makeUser(uniqueEmail("ex-stranger"));
  await link(tutor.id, student.id, "active");
  await link(endedTutor.id, student.id, "ended");
  await admin().from("profiles").update({ language: "fr" }).eq("id", student.id);
  const { data, error } = await admin().from("topics").insert({ student_id: student.id, name: "Numbers" }).select("id").single();
  if (error) throw new Error(error.message);
  topicId = data.id;
});
afterAll(deleteUsers);
beforeEach(() => call.mockClear());

describe("extractUploadWith", () => {
  it("a tutor's extraction creates a draft upload with its items in order", async () => {
    const out = await extractUploadWith(ctx(tutor), fresh(), { call });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.uploadId).toBeTruthy();
    expect(out.items.map((i) => i.text)).toEqual(["uno", "ser vs estar", "¿cuánto cuesta?"]);
    expect(out.items[0].topic).toEqual({ existingId: topicId });
    expect(out.items[2].topic).toEqual({ newName: "Shopping" });
    // The student's language reached the prompt, read past the tutor's RLS.
    expect(call.mock.calls[0][0].system).toContain("French");
    expect(call.mock.calls[0][0].system).toContain("Numbers");

    const { data: up } = await admin().from("uploads").select("*").eq("id", out.uploadId!).single();
    expect(up).toMatchObject({ student_id: student.id, uploader_id: tutor.id, status: "draft", extract_version: EXTRACT_VERSION });
  });

  it("the same content uploaded twice calls Claude once", async () => {
    const input = fresh();
    const first = await extractUploadWith(ctx(tutor), input, { call });
    const second = await extractUploadWith(ctx(tutor), input, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("one changed character calls Claude again", async () => {
    const input = fresh();
    await extractUploadWith(ctx(tutor), input, { call });
    await extractUploadWith(ctx(tutor), { ...input, text: input.text + "." }, { call });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("a new EXTRACT_VERSION calls Claude again for identical content", async () => {
    const input = fresh();
    await extractUploadWith(ctx(tutor), input, { call });
    await extractUploadWith(ctx(tutor), input, { call, version: "2:test-model" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("the cache is per uploader: the student uploading the same notes extracts their own draft", async () => {
    const input = fresh();
    const t = await extractUploadWith(ctx(tutor), input, { call });
    const s = await extractUploadWith(ctx(student), input, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(s.status === "ok" && t.status === "ok" && s.uploadId !== t.uploadId).toBe(true);
  });

  it("a published upload returns its lesson without calling Claude", async () => {
    const input = fresh();
    const first = await extractUploadWith(ctx(tutor), input, { call });
    if (first.status !== "ok") throw new Error("expected ok");
    const { data: lesson } = await admin()
      .from("lessons")
      .insert({ student_id: student.id, source: "tutor", tutor_id: tutor.id, published_by: tutor.id })
      .select("id")
      .single();
    await admin().from("uploads").update({ status: "published", lesson_id: lesson!.id }).eq("id", first.uploadId!);
    call.mockClear();
    expect(await extractUploadWith(ctx(tutor), input, { call })).toEqual({ status: "published", lessonId: lesson!.id });
    expect(call).not.toHaveBeenCalled();
  });

  it("a discarded upload comes back as a draft with freshly extracted items", async () => {
    const input = fresh();
    const first = await extractUploadWith(ctx(tutor), input, { call });
    if (first.status !== "ok") throw new Error("expected ok");
    await tutor.client.from("uploads").update({ status: "discarded" }).eq("id", first.uploadId!);
    call.mockClear();
    call.mockImplementationOnce(async () => ({ items: [{ ...modelItems[2], text: "otra vez" }] }) as never);
    const again = await extractUploadWith(ctx(tutor), input, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ status: "ok", uploadId: first.uploadId });
    const { data: rows } = await admin().from("draft_items").select("text").eq("upload_id", first.uploadId!);
    expect(rows!.map((r) => r.text)).toEqual(["otra vez"]);
    const { data: up } = await admin().from("uploads").select("status").eq("id", first.uploadId!).single();
    expect(up!.status).toBe("draft");
  });

  it("empty extraction creates no upload", async () => {
    const input = fresh();
    const empty = vi.fn(async () => ({ items: [] }) as never);
    expect(await extractUploadWith(ctx(tutor), input, { call: empty })).toEqual({ status: "ok", uploadId: null, items: [] });
    const { count } = await admin().from("uploads").select("id", { count: "exact", head: true }).eq("uploader_id", tutor.id).eq("student_id", student.id).eq("content_hash", contentHash(input.text, undefined));
    expect(count).toBe(0);
    // Nothing was cached, so the next try asks again.
    await extractUploadWith(ctx(tutor), input, { call });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("a failed Claude call leaves no upload row, so a retry starts clean", async () => {
    const input = fresh();
    const before = await admin().from("uploads").select("id", { count: "exact", head: true }).eq("uploader_id", tutor.id);
    const broken = vi.fn(async () => {
      throw new ClaudeUpstreamError("down", 500);
    });
    await expect(extractUploadWith(ctx(tutor), input, { call: broken as never })).rejects.toBeInstanceOf(ClaudeUpstreamError);
    const after = await admin().from("uploads").select("id", { count: "exact", head: true }).eq("uploader_id", tutor.id);
    expect(after.count).toBe(before.count);
    await extractUploadWith(ctx(tutor), input, { call });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("refuses a stranger and an ended tutor without calling Claude", async () => {
    await expect(extractUploadWith(ctx(stranger), fresh(), { call })).rejects.toBeInstanceOf(ExtractAccessError);
    await expect(extractUploadWith(ctx(endedTutor), fresh(), { call })).rejects.toBeInstanceOf(ExtractAccessError);
    expect(call).not.toHaveBeenCalled();
  });

  it("a tutor can delete items of their own draft but not another uploader's", async () => {
    const mine = await extractUploadWith(ctx(tutor), fresh(), { call });
    const theirs = await extractUploadWith(ctx(student), fresh(), { call });
    if (mine.status !== "ok" || theirs.status !== "ok") throw new Error("expected ok");
    await tutor.client.from("draft_items").delete().eq("upload_id", theirs.uploadId!);
    const { count: kept } = await admin().from("draft_items").select("id", { count: "exact", head: true }).eq("upload_id", theirs.uploadId!);
    expect(kept).toBe(3);
    await tutor.client.from("draft_items").delete().eq("upload_id", mine.uploadId!);
    const { count: gone } = await admin().from("draft_items").select("id", { count: "exact", head: true }).eq("upload_id", mine.uploadId!);
    expect(gone).toBe(0);
  });
});
