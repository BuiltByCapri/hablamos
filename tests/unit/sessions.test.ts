import { describe, expect, it } from "vitest";
import { closeIdle, flashcardDeck, shouldCount, validateSessionInput } from "../../lib/sessions";

describe("shouldCount", () => {
  it("opening flashcards and leaving with no answers is not counted", () => {
    expect(shouldCount("flashcards", [], null)).toBe(false);
  });
  it("one answer counts", () => {
    expect(shouldCount("flashcards", [{ outcome: "right" }], null)).toBe(true);
    expect(shouldCount("flashcards", [{ outcome: "missed" }], null)).toBe(true);
  });
  it("came_up alone is not a flashcard answer", () => {
    expect(shouldCount("flashcards", [{ outcome: "came_up" }], null)).toBe(false);
  });
  it("voice counts only when spokeAt is set", () => {
    expect(shouldCount("voice", [{ outcome: "came_up" }], null)).toBe(false);
    expect(shouldCount("voice", [], new Date())).toBe(true);
  });
});

describe("closeIdle", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const s = (id: string, minutesAgo: number, ended: string | null = null) => ({
    id,
    startedAt: new Date(now.getTime() - minutesAgo * 60_000),
    lastResultAt: null,
    spokeAt: null,
    endedAt: ended,
  });
  it("closes a session idle for 10 minutes and not one idle for 9", () => {
    expect(closeIdle(now, [s("ten", 10), s("nine", 9)])).toEqual(["ten"]);
  });
  it("measures from spokeAt too", () => {
    const spoke = { ...s("v", 60), spokeAt: new Date(now.getTime() - 3 * 60_000) };
    expect(closeIdle(now, [spoke])).toEqual([]);
  });
  it("measures from the last result, and skips finished sessions", () => {
    const active = { ...s("a", 60), lastResultAt: new Date(now.getTime() - 2 * 60_000).toISOString() };
    expect(closeIdle(now, [active, s("done", 60, "2026-10-25T11:00:00Z")])).toEqual([]);
  });
});

describe("flashcardDeck", () => {
  it("grammar items are excluded from the flashcard deck", () => {
    const items = [
      { id: "1", kind: "word" },
      { id: "2", kind: "grammar" },
      { id: "3", kind: "phrase" },
    ];
    expect(flashcardDeck(items).map((i) => i.id)).toEqual(["1", "3"]);
  });
});

describe("validateSessionInput", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("accepts the three actions", () => {
    expect(validateSessionInput({ action: "start", mode: "flashcards" })).toEqual({ action: "start", mode: "flashcards" });
    expect(validateSessionInput({ action: "result", sessionId: id, itemId: id, outcome: "right" }).action).toBe("result");
    expect(validateSessionInput({ action: "finish", sessionId: id, spokeOnce: true })).toEqual({ action: "finish", sessionId: id });
    expect(validateSessionInput({ action: "spoke", sessionId: id })).toEqual({ action: "spoke", sessionId: id });
  });
  it("rejects an unknown action, a bad outcome and a bad id", () => {
    expect(() => validateSessionInput({ action: "nope" })).toThrow();
    expect(() => validateSessionInput({ action: "result", sessionId: id, itemId: id, outcome: "great" })).toThrow();
    expect(() => validateSessionInput({ action: "finish", sessionId: "x" })).toThrow();
    expect(() => validateSessionInput(null)).toThrow();
  });
});

describe("quiz sessions", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("a quiz counts once one question is answered, item or skill", () => {
    expect(shouldCount("quiz", [], null)).toBe(false);
    expect(shouldCount("quiz", [{ outcome: "missed" }], null)).toBe(true);
    expect(shouldCount("quiz", [], null, new Date())).toBe(true);
  });
  it("answeredAt counts for nothing outside a quiz", () => {
    expect(shouldCount("flashcards", [], null, new Date())).toBe(false);
  });
  it("starts a quiz and records that a skill question was answered", () => {
    expect(validateSessionInput({ action: "start", mode: "quiz" })).toEqual({ action: "start", mode: "quiz" });
    expect(validateSessionInput({ action: "answered", sessionId: id })).toEqual({ action: "answered", sessionId: id });
    expect(() => validateSessionInput({ action: "start", mode: "exam" })).toThrow();
  });
  it("measures idle time from the last answered question too", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const s = {
      id: "q",
      startedAt: new Date(now.getTime() - 60 * 60_000),
      lastResultAt: null,
      spokeAt: null,
      answeredAt: new Date(now.getTime() - 2 * 60_000),
      endedAt: null,
    };
    expect(closeIdle(now, [s])).toEqual([]);
  });
});
