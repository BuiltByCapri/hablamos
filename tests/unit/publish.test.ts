import { describe, expect, it, vi } from "vitest";
import { PublishInputError, publishUploadWith, validatePublishInput } from "../../lib/publish";

const item = {
  kind: "word",
  text: "uno",
  meaning: "one",
  example: null,
  explanation: null,
  topic: { newName: "Numbers" },
};
const ID = "3f2b8c1e-5a47-4d6e-9b0a-1c2d3e4f5a6b";

describe("validatePublishInput", () => {
  it("accepts a well formed body and trims text", () => {
    const out = validatePublishInput({ uploadId: ID, items: [{ ...item, text: "  uno " }], lessonDate: "2026-10-20" });
    expect(out.items[0].text).toBe("uno");
    expect(out.lessonDate).toBe("2026-10-20");
  });

  it("rejects a missing or malformed upload id", () => {
    expect(() => validatePublishInput({ items: [item] })).toThrow(PublishInputError);
    expect(() => validatePublishInput({ uploadId: "x", items: [item] })).toThrow(PublishInputError);
  });

  it("rejects no items", () => {
    expect(() => validatePublishInput({ uploadId: ID, items: [] })).toThrow(PublishInputError);
  });

  it("rejects an unknown kind, blank text or blank meaning", () => {
    for (const bad of [{ ...item, kind: "verb" }, { ...item, text: "  " }, { ...item, meaning: "" }]) {
      expect(() => validatePublishInput({ uploadId: ID, items: [bad] })).toThrow(PublishInputError);
    }
  });

  it("rejects a topic that is neither an id nor a name", () => {
    expect(() => validatePublishInput({ uploadId: ID, items: [{ ...item, topic: {} }] })).toThrow(PublishInputError);
    expect(() => validatePublishInput({ uploadId: ID, items: [{ ...item, topic: { newName: " " } }] })).toThrow(PublishInputError);
    expect(() => validatePublishInput({ uploadId: ID, items: [{ ...item, topic: { existingId: "nope" } }] })).toThrow(PublishInputError);
  });

  it("keeps an explanation only on grammar items", () => {
    const out = validatePublishInput({
      uploadId: ID,
      items: [
        { ...item, explanation: "stray" },
        { ...item, kind: "grammar", explanation: "Ser for traits." },
      ],
    });
    expect(out.items[0].explanation).toBeNull();
    expect(out.items[1].explanation).toBe("Ser for traits.");
  });

  it("rejects a bad lesson date", () => {
    expect(() => validatePublishInput({ uploadId: ID, items: [item], lessonDate: "yesterday" })).toThrow(PublishInputError);
    expect(() => validatePublishInput({ uploadId: ID, items: [item], lessonDate: "2026-02-31" })).toThrow(PublishInputError);
  });
});

describe("publishUploadWith", () => {
  const boom = () => {
    throw new Error("must not read tables");
  };
  const fake = (rpc: (name: string, args: Record<string, unknown>) => unknown) =>
    ({ rpc: vi.fn(async (n: string, a: Record<string, unknown>) => rpc(n, a)), from: boom }) as never;

  it("leaves the notification time to the database: no send time is passed and no table is read", async () => {
    const db = fake(() => ({ data: { lessonId: "l1", itemCount: 1 }, error: null }));
    const out = await publishUploadWith({ db, admin: { from: boom } as never }, { uploadId: ID, items: [item as never] });
    expect(out).toEqual({ lessonId: "l1", itemCount: 1 });
    const args = (db as unknown as { rpc: { mock: { calls: [string, Record<string, unknown>][] } } }).rpc.mock.calls[0][1];
    expect(Object.keys(args).sort()).toEqual(["p_items", "p_lesson_date", "p_upload"]);
  });

  it("maps a student profile that cannot be read to a failure, not a default", async () => {
    const db = fake(() => ({ data: null, error: { message: "student_profile_unreadable" } }));
    await expect(publishUploadWith({ db, admin: {} as never }, { uploadId: ID, items: [item as never] })).rejects.toMatchObject({
      code: "profile_unreadable",
    });
  });
});
