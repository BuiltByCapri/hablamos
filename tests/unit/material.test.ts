import { describe, expect, it } from "vitest";
import { newItems, planMerge, planUndoMerge, type LessonRef, type ItemRef } from "../../lib/material";

const lesson = (id: string, published_at: string): LessonRef => ({ id, published_at });
const item = (id: string, lesson_id: string | null, extra: Partial<ItemRef> = {}): ItemRef => ({
  id,
  lesson_id,
  topic_id: "t1",
  deleted_at: null,
  ...extra,
});

const lessons = [lesson("old", "2026-10-01T10:00:00Z"), lesson("new", "2026-10-20T10:00:00Z")];

describe("newItems", () => {
  it("returns only the latest-published lesson's unstudied items", () => {
    const items = [item("a", "old"), item("b", "new"), item("c", "new"), item("d", null)];
    expect(newItems(items, lessons, new Set(["c"])).map((i) => i.id)).toEqual(["b"]);
  });

  it("returns [] when there are no lessons", () => {
    expect(newItems([item("a", null)], [], new Set())).toEqual([]);
  });

  it("moving an older lesson's date later does not make its items new", () => {
    // lesson_date is not a field newItems reads: only published_at decides.
    const withDates = [
      { ...lesson("old", "2026-10-01T10:00:00Z"), lesson_date: "2026-12-31" },
      { ...lesson("new", "2026-10-20T10:00:00Z"), lesson_date: "2026-10-20" },
    ];
    expect(newItems([item("a", "old"), item("b", "new")], withDates, new Set()).map((i) => i.id)).toEqual(["b"]);
  });

  it("an edited item that was studied stays not new", () => {
    const edited = { ...item("b", "new"), last_edited_at: "2026-10-25T10:00:00Z" };
    expect(newItems([edited, item("c", "new")], lessons, new Set(["b"])).map((i) => i.id)).toEqual(["c"]);
  });

  it("removed items are never new", () => {
    const gone = item("b", "new", { deleted_at: "2026-10-22T10:00:00Z" });
    expect(newItems([gone, item("c", "new")], lessons, new Set()).map((i) => i.id)).toEqual(["c"]);
  });
});

describe("merge and undo", () => {
  const items = [
    item("a", "old", { topic_id: "from" }),
    item("b", "old", { topic_id: "from" }),
    item("c", "old", { topic_id: "into" }),
    item("d", "old", { topic_id: "other" }),
  ];

  it("mergeTopics leaves no item pointing at the merged topic and undoMerge restores the original topic and its exact items", () => {
    const merged = planMerge(items, "from", "into");
    expect(merged.itemIds.sort()).toEqual(["a", "b"]);
    expect(merged.items.some((i) => i.topic_id === "from")).toBe(false);
    expect(merged.items.find((i) => i.id === "c")!.topic_id).toBe("into");
    expect(merged.items.find((i) => i.id === "d")!.topic_id).toBe("other");

    const undone = planUndoMerge(merged.items, { fromId: "from", intoId: "into", itemIds: merged.itemIds });
    expect(undone).toEqual(items);
  });

  it("undoMerge leaves an item added to the merged topic after the merge where it is", () => {
    const merged = planMerge(items, "from", "into");
    // Added later; the live topic of the merged one is "into".
    const after = [...merged.items, item("e", "new", { topic_id: "into" })];
    const undone = planUndoMerge(after, { fromId: "from", intoId: "into", itemIds: merged.itemIds });
    expect(undone.find((i) => i.id === "e")!.topic_id).toBe("into");
    expect(undone.filter((i) => i.topic_id === "from").map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("undoMerge leaves a logged item the user has since moved elsewhere", () => {
    const merged = planMerge(items, "from", "into");
    const moved = merged.items.map((i) => (i.id === "a" ? { ...i, topic_id: "other" } : i));
    const undone = planUndoMerge(moved, { fromId: "from", intoId: "into", itemIds: merged.itemIds });
    expect(undone.find((i) => i.id === "a")!.topic_id).toBe("other");
    expect(undone.find((i) => i.id === "b")!.topic_id).toBe("from");
  });
});
