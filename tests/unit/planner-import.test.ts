import { describe, expect, it } from "vitest";
import { COUNTRIES_TOPIC, IMPORT_KEY, IMPORT_LESSON_DATE, importLessonRow, planPlannerImport } from "../../lib/planner-import";
import { PLANNER_SETS } from "../../lib/spanish/planner-sets";
import { COUNTRIES } from "../../lib/spanish/countries";

const total = Object.values(PLANNER_SETS).reduce((n, s) => n + s.length, 0) + COUNTRIES.length;
const find = (plan: ReturnType<typeof planPlannerImport>, text: string) => plan.items.find((i) => i.text === text)!;

describe("planPlannerImport", () => {
  it("plans one topic per set plus Countries & nationalities, and every entry as an item", () => {
    const plan = planPlannerImport([], PLANNER_SETS, COUNTRIES);
    expect(plan.createTopics).toEqual([...Object.keys(PLANNER_SETS), COUNTRIES_TOPIC]);
    expect(plan.items).toHaveLength(total);
    expect(new Set(plan.items.map((i) => i.importKey)).size).toBe(total);
    expect(find(plan, "rojo")).toEqual({
      importKey: `${IMPORT_KEY}:Colors:rojo`,
      topicName: "Colors",
      topicId: null,
      kind: "word",
      text: "rojo",
      meaning: "red",
    });
  });

  it("reuses existing topics by name, ignoring case", () => {
    const plan = planPlannerImport(
      [
        { id: "t-colors", name: "colors" },
        { id: "t-countries", name: "COUNTRIES & NATIONALITIES" },
      ],
      PLANNER_SETS,
      COUNTRIES,
    );
    expect(plan.createTopics).not.toContain("Colors");
    expect(plan.createTopics).not.toContain(COUNTRIES_TOPIC);
    expect(find(plan, "azul").topicId).toBe("t-colors");
    expect(find(plan, "México").topicId).toBe("t-countries");
  });

  it("makes one word, with or without its article, a word, and two or more a phrase, except numbers", () => {
    const plan = planPlannerImport([], PLANNER_SETS, COUNTRIES);
    expect(find(plan, "hola").kind).toBe("word");
    expect(find(plan, "por favor").kind).toBe("phrase");
    expect(find(plan, "el horario").kind).toBe("word");
    expect(find(plan, "la clase").kind).toBe("word");
    expect(find(plan, "el salón de clase").kind).toBe("phrase");
    expect(find(plan, "el compañero de clase").kind).toBe("phrase");
    expect(find(plan, "ciento uno").kind).toBe("word");
    expect(find(plan, "un millón doscientos mil").kind).toBe("word");
    expect(find(plan, "Estados Unidos").kind).toBe("phrase");
    expect(find(plan, "Perú").kind).toBe("word");
  });

  it("gives a country its English name and nationality, one form when they match", () => {
    const plan = planPlannerImport([], PLANNER_SETS, COUNTRIES);
    expect(find(plan, "México")).toMatchObject({
      meaning: "Mexico · mexicano / mexicana",
      topicName: COUNTRIES_TOPIC,
      importKey: `${IMPORT_KEY}:${COUNTRIES_TOPIC}:México`,
    });
    expect(find(plan, "Canadá").meaning).toBe("Canada · canadiense");
  });

  it("skips items already imported, and creates no topic left with nothing to add", () => {
    const first = planPlannerImport([], PLANNER_SETS, COUNTRIES);
    const again = planPlannerImport([], PLANNER_SETS, COUNTRIES, first.items.map((i) => i.importKey));
    expect(again).toEqual({ createTopics: [], items: [] });
    const colorsDone = first.items.filter((i) => i.topicName === "Colors").map((i) => i.importKey);
    const partial = planPlannerImport([], PLANNER_SETS, COUNTRIES, colorsDone);
    expect(partial.createTopics).not.toContain("Colors");
    expect(partial.items).toHaveLength(total - colorsDone.length);
  });
});

describe("importLessonRow", () => {
  it("dates the import lesson to her first planner lesson, so it is an earlier letter and never the newest", () => {
    expect(IMPORT_LESSON_DATE).toBe("2026-09-10");
    expect(importLessonRow("s1", "Capri")).toEqual({
      student_id: "s1",
      published_by: "s1",
      publisher_name: "Capri",
      published_at: "2026-09-10T12:00:00Z",
      lesson_date: "2026-09-10",
      source: "import",
      import_key: IMPORT_KEY,
    });
  });
});
