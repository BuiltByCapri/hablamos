// Loads the sets Capri's planner seeded, and the countries, into one student's
// material: a topic per set, a "Countries & nationalities" topic, and every
// entry as an item added by the student, under one import lesson. Each item
// carries an import key, so running it again adds nothing.
//
// Only type imports here: scripts/import-planner-sets.ts runs this file under
// Node's own TypeScript support, which does not resolve extensionless paths.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Country } from "./spanish/countries";
import type { PlannerEntry } from "./spanish/planner-sets";

export const IMPORT_KEY = "planner-sets-v1";
export const COUNTRIES_TOPIC = "Countries & nationalities";
const NUMBERS_SET = "Numbers";

/**
 * The first lesson date in her planner. The import lesson is dated then, so it
 * is an earlier letter, never the newest, and its items never show as New
 * ahead of her tutor's lessons.
 */
export const IMPORT_LESSON_DATE = "2026-09-10";

/** The import lesson as inserted. */
export function importLessonRow(studentId: string, name: string) {
  return {
    student_id: studentId,
    published_by: studentId,
    publisher_name: name,
    published_at: `${IMPORT_LESSON_DATE}T12:00:00Z`,
    lesson_date: IMPORT_LESSON_DATE,
    source: "import",
    import_key: IMPORT_KEY,
  };
}

/** One word, or one word after a leading article (el horario), is a word. Two or more words are a phrase. */
function isOneWord(text: string): boolean {
  return !/\s/.test(text.trim().replace(/^(el|la|los|las|un|una)\s+/i, ""));
}

export type PlannedItem = {
  importKey: string;
  topicName: string;
  /** The existing topic it goes into, or null when the topic is created. */
  topicId: string | null;
  kind: "word" | "phrase";
  text: string;
  meaning: string;
};

export type ImportPlan = { createTopics: string[]; items: PlannedItem[] };

/** "Mexico · mexicano / mexicana", or one form when they match. */
function countryMeaning(c: Country): string {
  const nat = c.masculine === c.feminine ? c.masculine : `${c.masculine} / ${c.feminine}`;
  return `${c.english} · ${nat}`;
}

/**
 * What to create. Topics are matched to existing ones by name, ignoring case.
 * A word is one word, with or without a leading article; two or more words
 * are a phrase; numbers are always words. Items whose key is in existingKeys are left out, and a
 * topic with nothing left to add is not created.
 */
export function planPlannerImport(
  existingTopics: { id: string; name: string }[],
  sets: Record<string, PlannerEntry[]>,
  countries: Country[],
  existingKeys: Iterable<string> = [],
): ImportPlan {
  const have = new Set(existingKeys);
  const topicIds = new Map(existingTopics.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const groups: [string, { text: string; meaning: string; word: boolean }[]][] = [
    ...Object.entries(sets).map(
      ([name, entries]) =>
        [name, entries.map((e) => ({ text: e.es, meaning: e.en, word: name === NUMBERS_SET || isOneWord(e.es) }))] as [
          string,
          { text: string; meaning: string; word: boolean }[],
        ],
    ),
    [COUNTRIES_TOPIC, countries.map((c) => ({ text: c.country, meaning: countryMeaning(c), word: isOneWord(c.country) }))],
  ];

  const createTopics: string[] = [];
  const items: PlannedItem[] = [];
  for (const [name, entries] of groups) {
    const topicId = topicIds.get(name.toLowerCase()) ?? null;
    const fresh = entries
      .map((e) => ({ ...e, importKey: `${IMPORT_KEY}:${name}:${e.text}` }))
      .filter((e) => !have.has(e.importKey));
    if (!fresh.length) continue;
    if (!topicId) createTopics.push(name);
    for (const e of fresh) {
      items.push({ importKey: e.importKey, topicName: name, topicId, kind: e.word ? "word" : "phrase", text: e.text, meaning: e.meaning });
    }
  }
  return { createTopics, items };
}

// ---------------------------------------------------------------- running it

export type ImportResult = { studentId: string; topicsCreated: number; itemsAdded: number };

const UNIQUE_VIOLATION = "23505";

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data as T;
}

/**
 * Imports into the student with this email, with a service-role client. Safe
 * to run again: the lesson, topics and items are each found before they are
 * made, and items are inserted ignoring any import key already there.
 */
export async function importPlannerSets(
  db: SupabaseClient,
  email: string,
  sets: Record<string, PlannerEntry[]>,
  countries: Country[],
): Promise<ImportResult> {
  const wanted = email.trim().toLowerCase();
  const profiles = must<{ id: string; email: string | null; display_name: string | null }[]>(
    await db.from("profiles").select("id, email, display_name").ilike("email", wanted.replace(/[\\%_]/g, "\\$&")),
    "reading the profile",
  );
  if (profiles.length !== 1) throw new Error(profiles.length ? `more than one profile has the email ${wanted}` : `no profile has the email ${wanted}`);
  const student = profiles[0];
  const name = student.display_name?.trim() || student.email || "";

  const topics = must<{ id: string; name: string }[]>(
    await db.from("topics").select("id, name").eq("student_id", student.id).is("merged_into", null),
    "reading topics",
  );
  const keys: string[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must<{ import_key: string }[]>(
      await db
        .from("items")
        .select("import_key")
        .eq("student_id", student.id)
        .like("import_key", `${IMPORT_KEY}:%`)
        .order("import_key")
        .range(from, from + 999),
      "reading imported items",
    );
    keys.push(...page.map((r) => r.import_key));
    if (page.length < 1000) break;
  }

  const plan = planPlannerImport(topics, sets, countries, keys);
  if (!plan.items.length) return { studentId: student.id, topicsCreated: 0, itemsAdded: 0 };

  const log = async (rows: Record<string, unknown>[]) => {
    for (let n = 0; n < rows.length; n += 200) {
      must(await db.from("change_log").insert(rows.slice(n, n + 200)), "writing the change log");
    }
  };
  const logRow = (entity: string, id: string, after: unknown) => ({
    student_id: student.id,
    entity,
    entity_id: id,
    actor_id: student.id,
    actor_name: name,
    action: "create",
    before: null,
    after,
  });

  // The lesson: one per student, found by its import key.
  const findLesson = async () =>
    must<{ id: string }[]>(
      await db.from("lessons").select("id").eq("student_id", student.id).eq("import_key", IMPORT_KEY),
      "reading the import lesson",
    )[0]?.id;
  let lessonId = await findLesson();
  if (!lessonId) {
    const made = await db
      .from("lessons")
      .insert(importLessonRow(student.id, name))
      .select("id")
      .single();
    if (made.error && made.error.code !== UNIQUE_VIOLATION) throw new Error(`creating the import lesson failed: ${made.error.message}`);
    if (made.data) {
      lessonId = made.data.id as string;
      await log([logRow("lesson", lessonId, { source: "import", import_key: IMPORT_KEY })]);
    } else {
      lessonId = await findLesson();
    }
  }
  if (!lessonId) throw new Error("the import lesson could not be found or made");

  // Topics, matched by name again in case one appeared since the plan.
  const topicIds = new Map<string, string>();
  let topicsCreated = 0;
  for (const topicName of plan.createTopics) {
    const made = await db.from("topics").insert({ student_id: student.id, name: topicName }).select("id").single();
    if (made.data) {
      topicIds.set(topicName, made.data.id as string);
      topicsCreated++;
      await log([logRow("topic", made.data.id as string, { name: topicName })]);
      continue;
    }
    if (made.error?.code !== UNIQUE_VIOLATION) throw new Error(`creating topic ${topicName} failed: ${made.error?.message}`);
    const found = must<{ id: string }[]>(
      await db.from("topics").select("id").eq("student_id", student.id).is("merged_into", null).ilike("name", topicName.replace(/[\\%_]/g, "\\$&")),
      "reading a topic",
    );
    if (!found[0]) throw new Error(`topic ${topicName} could not be found or made`);
    topicIds.set(topicName, found[0].id);
  }

  let itemsAdded = 0;
  for (let n = 0; n < plan.items.length; n += 100) {
    const rows = plan.items.slice(n, n + 100).map((i) => ({
      student_id: student.id,
      topic_id: i.topicId ?? topicIds.get(i.topicName)!,
      kind: i.kind,
      text: i.text,
      meaning: i.meaning,
      created_by: student.id,
      created_by_name: name,
      created_by_role: "student",
      lesson_id: lessonId,
      import_key: i.importKey,
    }));
    const inserted = must<Record<string, unknown>[]>(
      await db.from("items").upsert(rows, { onConflict: "student_id,import_key", ignoreDuplicates: true }).select("*"),
      "adding items",
    );
    itemsAdded += inserted.length;
    await log(
      inserted.map((row) => {
        const { student_id: _omit, ...after } = row;
        void _omit;
        return logRow("item", row.id as string, after);
      }),
    );
  }
  return { studentId: student.id, topicsCreated, itemsAdded };
}
