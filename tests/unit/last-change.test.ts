import { describe, expect, it } from "vitest";
import { lastChange, type LogRow } from "../../lib/last-change";

const edit = (actor_id: string, actor_name: string, after: object, at: string): LogRow => ({ actor_id, actor_name, after, at });

describe("lastChange", () => {
  it("takes name and date from the latest row for the field, among many level edits and one older focus edit", () => {
    const log = [
      edit("t1", "Profe Ana", { level: "A2" }, "2026-10-05T15:00:00Z"),
      edit("me", "Capri", { focus: "ser vs estar" }, "2026-10-02T15:00:00Z"),
      edit("t2", "Profe Luis", { level: "B2" }, "2026-10-21T15:00:00Z"),
      edit("t1", "Profe Ana", { level: "B1" }, "2026-10-12T15:00:00Z"),
      edit("me", "Capri", { level: "A1" }, "2026-10-01T15:00:00Z"),
    ];
    expect(lastChange("level", log, "me", "America/New_York")).toBe("Last changed by Profe Luis, Oct 21, 2026");
    expect(lastChange("focus", log, "me", "America/New_York")).toBe("Last changed by you, Oct 2, 2026");
  });

  it("dates the change in the student's time zone", () => {
    const late = [edit("t1", "Profe Ana", { level: "B1" }, "2026-10-21T02:00:00Z")];
    expect(lastChange("level", late, "me", "America/New_York")).toBe("Last changed by Profe Ana, Oct 20, 2026");
    expect(lastChange("level", late, "me", "UTC")).toBe("Last changed by Profe Ana, Oct 21, 2026");
  });

  it("still names a tutor whose account is gone, from the log's snapshot", () => {
    const gone = [edit("deleted", "Profe Marta", { level: "A2" }, "2026-10-20T15:00:00Z")];
    expect(lastChange("level", gone, "me", "UTC")).toBe("Last changed by Profe Marta, Oct 20, 2026");
  });

  it("is empty for a field nobody has set", () => {
    expect(lastChange("focus", [edit("me", "Capri", { level: "A1" }, "2026-10-01T15:00:00Z")], "me", "UTC")).toBeNull();
    expect(lastChange("level", [], "me", "UTC")).toBeNull();
  });
});
