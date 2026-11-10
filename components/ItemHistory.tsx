import { restoreItemForm } from "../app/actions";
import { whenText, type ChangeRow } from "../lib/material";

const VERB: Record<string, string> = {
  create: "Added",
  edit: "Edited",
  remove: "Removed",
  restore: "Restored an earlier version",
};
const FIELDS = ["text", "meaning", "example", "explanation", "topic_id", "deleted_at"] as const;
const FIELD_LABEL: Record<string, string> = {
  text: "text",
  meaning: "meaning",
  example: "example",
  explanation: "explanation",
  topic_id: "topic",
  deleted_at: "removed",
};
// The fields whose old and new wording is worth showing struck through.
const WORDED = new Set(["text", "meaning", "example", "explanation"]);

const changed = (c: ChangeRow) =>
  !c.before || !c.after ? [] : FIELDS.filter((f) => (c.before![f] ?? null) !== (c.after![f] ?? null));

const words = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/**
 * Every change to one item, newest first, read like a correction log: when
 * and who, then what changed, the old wording struck through and the new
 * beside it. Each change that has an earlier version has a button that makes
 * that earlier version current again. Restoring adds a row; it never rewrites
 * one. The creation has no earlier version, so it has no button.
 */
export function ItemHistory({
  changes,
  viewerId,
  timeZone,
  returnTo,
}: {
  changes: ChangeRow[];
  viewerId: string;
  timeZone: string;
  returnTo: string;
}) {
  const rows = [...changes].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <ol className="history">
      {rows.map((c) => {
        const fields = changed(c);
        // An edit shows its wording changes as strike-throughs, so only the rest are named.
        const diffs = c.action === "edit" ? fields.filter((f) => WORDED.has(f)) : [];
        const named = fields.filter((f) => !diffs.includes(f));
        return (
          <li key={c.id}>
            <span className="when">
              {whenText(c.at, timeZone)} · {c.actor_id === viewerId ? "you" : c.actor_name || "someone"}
            </span>
            <span className="what">
              {VERB[c.action] ?? c.action}
              {named.length > 0 && `: ${named.map((f) => FIELD_LABEL[f]).join(", ")}`}
            </span>
            {diffs.map((f) => {
              const was = words(c.before![f]);
              const now = words(c.after![f]);
              return (
                <span key={f} className="diff">
                  <span className="field-name">{FIELD_LABEL[f]}</span>
                  {was && <s>{was}</s>} {now ? <span className="redpen">{now}</span> : <em>cleared</em>}
                </span>
              );
            })}
            {c.before && (c.action === "edit" || c.action === "remove" || c.action === "restore") && (
              <form action={restoreItemForm.bind(null, c.id, returnTo)}>
                <button type="submit" className="link">
                  Restore the version before this
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ol>
  );
}
