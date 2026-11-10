// "Last changed by <name>, <date>" under level and focus. Both name and date
// come from the latest change_log row for that field. actor_name is a
// snapshot, so the name survives a tutor being unlinked or deleting their
// account. Every change to level or focus writes that row (the database
// rejects any other path), so the log is the complete record.

import type { SupabaseClient } from "@supabase/supabase-js";

export type LogRow = { actor_id: string | null; actor_name: string | null; after: unknown; at: string };

const touches = (row: LogRow, field: string) =>
  !!row.after && typeof row.after === "object" && field in (row.after as object);

export function lastChange(field: "level" | "focus", log: LogRow[], viewerId: string, timeZone: string): string | null {
  const row = log.filter((r) => touches(r, field)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (!row) return null;

  const name = row.actor_id === viewerId ? "you" : row.actor_name || "a former tutor";
  const format = (tz: string) =>
    new Date(row.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
  let date: string;
  try {
    date = format(timeZone);
  } catch {
    date = format("UTC");
  }
  return `Last changed by ${name}, ${date}`;
}

/**
 * The latest change_log row for level and the latest for focus, one row each.
 * `after->field` is SQL null only when the row did not touch that field.
 */
export async function latestSharedChanges(db: SupabaseClient, studentId: string): Promise<LogRow[]> {
  const rows = await Promise.all(
    (["level", "focus"] as const).map(async (field) => {
      const { data, error } = await db
        .from("change_log")
        .select("actor_id, actor_name, after, at")
        .eq("student_id", studentId)
        .eq("entity", "profile")
        .not(`after->${field}`, "is", null)
        .order("at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []) as LogRow[];
    }),
  );
  return rows.flat();
}
