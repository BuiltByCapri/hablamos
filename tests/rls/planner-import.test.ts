// The planner import against the test project, run twice: the first run adds
// every set and country with its history, the second adds nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, makeUser, uniqueEmail } from "./helpers";
import { COUNTRIES_TOPIC, IMPORT_KEY, importPlannerSets } from "../../lib/planner-import";
import { PLANNER_SETS } from "../../lib/spanish/planner-sets";
import { COUNTRIES } from "../../lib/spanish/countries";

let capri: { id: string; client: SupabaseClient };
let email: string;
const total = Object.values(PLANNER_SETS).reduce((n, s) => n + s.length, 0) + COUNTRIES.length;
const topicCount = Object.keys(PLANNER_SETS).length + 1;

beforeAll(async () => {
  email = uniqueEmail("import");
  capri = await makeUser(email);
  const { error } = await admin().from("profiles").update({ display_name: "Capri" }).eq("id", capri.id);
  if (error) throw new Error(error.message);
  // An existing topic, named in another case, is reused rather than duplicated.
  const { error: tErr } = await admin().from("topics").insert({ student_id: capri.id, name: "colors" });
  if (tErr) throw new Error(tErr.message);
});
afterAll(deleteUsers);

describe("importPlannerSets", () => {
  it("adds every set and country once, and a second run adds nothing", async () => {
    const first = await importPlannerSets(admin(), email.toUpperCase(), PLANNER_SETS, COUNTRIES);
    expect(first).toEqual({ studentId: capri.id, topicsCreated: topicCount - 1, itemsAdded: total });

    const { data: items } = await admin()
      .from("items")
      .select("id, kind, text, meaning, created_by, created_by_name, created_by_role, import_key, lesson_id, topic_id")
      .eq("student_id", capri.id);
    expect(items).toHaveLength(total);
    for (const i of items!) {
      expect(i).toMatchObject({ created_by: capri.id, created_by_name: "Capri", created_by_role: "student" });
      expect(i.import_key.startsWith(`${IMPORT_KEY}:`)).toBe(true);
    }
    const mexico = items!.find((i) => i.text === "México")!;
    expect(mexico.meaning).toBe("Mexico · mexicano / mexicana");

    const { data: lessons } = await admin().from("lessons").select("id, source, import_key, lesson_date").eq("student_id", capri.id);
    expect(lessons).toHaveLength(1);
    expect(lessons![0]).toMatchObject({ source: "import", import_key: IMPORT_KEY });
    expect(new Set(items!.map((i) => i.lesson_id))).toEqual(new Set([lessons![0].id]));

    const { data: topics } = await admin().from("topics").select("id, name").eq("student_id", capri.id);
    expect(topics).toHaveLength(topicCount);
    expect(topics!.map((t) => t.name)).toContain(COUNTRIES_TOPIC);
    const colors = topics!.find((t) => t.name === "colors")!;
    expect(items!.find((i) => i.text === "rojo")!.topic_id).toBe(colors.id);

    const { data: log } = await admin().from("change_log").select("entity, action, actor_id").eq("student_id", capri.id);
    expect(log!.filter((l) => l.entity === "item" && l.action === "create")).toHaveLength(total);
    expect(log!.filter((l) => l.entity === "topic" && l.action === "create")).toHaveLength(topicCount - 1);
    expect(log!.every((l) => l.actor_id === capri.id)).toBe(true);

    const second = await importPlannerSets(admin(), email, PLANNER_SETS, COUNTRIES);
    expect(second).toEqual({ studentId: capri.id, topicsCreated: 0, itemsAdded: 0 });
    const { count: itemsAfter } = await admin().from("items").select("id", { count: "exact", head: true }).eq("student_id", capri.id);
    const { count: topicsAfter } = await admin().from("topics").select("id", { count: "exact", head: true }).eq("student_id", capri.id);
    const { count: lessonsAfter } = await admin().from("lessons").select("id", { count: "exact", head: true }).eq("student_id", capri.id);
    const { count: logAfter } = await admin().from("change_log").select("id", { count: "exact", head: true }).eq("student_id", capri.id);
    expect([itemsAfter, topicsAfter, lessonsAfter, logAfter]).toEqual([total, topicCount, 1, log!.length]);
  });

  it("refuses an email with no profile", async () => {
    await expect(importPlannerSets(admin(), "nobody-here@example.test", PLANNER_SETS, COUNTRIES)).rejects.toThrow(/no profile/);
  });
});
