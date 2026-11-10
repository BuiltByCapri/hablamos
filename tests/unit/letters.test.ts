import { describe, expect, it, test } from "vitest";
import { blankOut, countWord, describeKinds, groupLetters, HAND, shortDay, weekday, type LetterLesson } from "../../lib/letters";

const lesson = (id: string, at: string, source = "tutor", name: string | null = "Daniel Ruiz"): LetterLesson => ({
  id,
  published_at: at,
  lesson_date: at.slice(0, 10),
  publisher_name: name,
  source,
});
const item = (id: string, lesson_id: string | null, created_at = "2026-10-01T10:00:00Z") => ({ id, lesson_id, created_at });

describe("groupLetters", () => {
  it("puts letters newest first by arrival, hand-added items in their own letter", () => {
    const lessons = [lesson("a", "2026-10-20T10:00:00Z"), lesson("b", "2026-10-28T10:00:00Z", "student", "Capri")];
    const items = [item("1", "a"), item("2", "b"), item("3", null, "2026-10-25T09:00:00Z"), item("4", "a")];
    const letters = groupLetters(lessons, items);
    expect(letters.map((l) => l.key)).toEqual(["b", HAND, "a"]);
    expect(letters[0]).toMatchObject({ kind: "own", from: null });
    expect(letters[1]).toMatchObject({ kind: "hand", date: "2026-10-25" });
    expect(letters[2]).toMatchObject({ kind: "tutor", from: "Daniel Ruiz" });
    expect(letters[2].items.map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("leaves out a lesson with no live items", () => {
    expect(groupLetters([lesson("a", "2026-10-20T10:00:00Z")], [])).toEqual([]);
  });

  it("names a tutor who left no name", () => {
    expect(groupLetters([lesson("a", "2026-10-20T10:00:00Z", "tutor", null)], [item("1", "a")])[0].from).toBe("Your tutor");
  });
});

describe("dates and counts", () => {
  it("reads a lesson day without shifting it by time zone", () => {
    expect(weekday("2026-10-27")).toBe("Tuesday");
    expect(shortDay("2026-10-27")).toBe("Oct 27");
  });

  it("writes small counts as words", () => {
    expect(countWord(4)).toBe("Four");
    expect(countWord(14)).toBe("14");
  });
});

describe("blankOut", () => {
  it("blanks the word, keeping the article when the example has it", () => {
    expect(blankOut("Te espero en el andén dos.", "el andén")).toBe("Te espero en el ___ dos.");
    expect(blankOut("Corta la cebolla en trozos.", "la cebolla")).toBe("Corta la ___ en trozos.");
  });

  it("does not blank inside another word, and gives up when the word is not there", () => {
    expect(blankOut("Hay pancitos.", "pan")).toBeNull();
    expect(blankOut("¿Tienes hambre?", "tener hambre")).toBeNull();
  });
});

describe("describeKinds", () => {
  test("names each kind instead of calling everything words", () => {
    expect(describeKinds([{ kind: "word" }, { kind: "word" }, { kind: "word" }, { kind: "phrase" }, { kind: "grammar" }])).toBe(
      "3 words · 1 phrase · 1 grammar point",
    );
  });
  test("a lesson of only grammar says grammar points", () => {
    expect(describeKinds([{ kind: "grammar" }, { kind: "grammar" }])).toBe("2 grammar points");
  });
  test("nothing inside says empty", () => {
    expect(describeKinds([])).toBe("Empty");
  });
});
