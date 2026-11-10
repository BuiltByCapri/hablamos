import { describe, expect, it } from "vitest";
import { itemStats, toRevisit } from "../../lib/progress";

const now = new Date("2026-10-25T12:00:00Z");
const r = (itemId: string, outcome: string, day: number) => ({ itemId, outcome, at: new Date(Date.UTC(2026, 9, day)) });

describe("toRevisit", () => {
  it("missed twice is to revisit", () => {
    expect(toRevisit(itemStats([r("a", "missed", 1), r("a", "right", 2), r("a", "missed", 3), r("a", "right", 4)]), now)).toEqual(["a"]);
  });
  it("missed once then right twice is not", () => {
    expect(toRevisit(itemStats([r("a", "missed", 1), r("a", "right", 2), r("a", "right", 3)]), now)).toEqual([]);
  });
  it("missed most recently is to revisit, most recent first", () => {
    const stats = itemStats([r("a", "right", 1), r("a", "missed", 2), r("b", "right", 1), r("b", "missed", 5)]);
    expect(toRevisit(stats, now)).toEqual(["b", "a"]);
  });
  it("came_up alone is neither right nor to revisit", () => {
    const stats = itemStats([r("a", "came_up", 1), r("a", "came_up", 2)]);
    expect(stats.get("a")).toMatchObject({ right: 0, missed: 0, cameUp: 2 });
    expect(toRevisit(stats, now)).toEqual([]);
  });
  it("a came_up after a miss does not clear it", () => {
    expect(toRevisit(itemStats([r("a", "missed", 1), r("a", "came_up", 2)]), now)).toEqual(["a"]);
  });
});
