import { ItemEditor, type EditableItem } from "./ItemEditor";
import { ItemHistory } from "./ItemHistory";
import { whenText, type ChangeRow } from "../lib/material";

type Topic = { id: string; name: string };
export type RowItem = EditableItem & {
  created_by: string | null;
  created_by_name: string | null;
  last_edited_at: string | null;
  deleted_at: string | null;
};

const who = (id: string | null, name: string | null, viewerId: string, fallback: string) =>
  id === viewerId ? "you" : name || fallback;

/** One item with who added it, who last edited it and when, and its history. */
export function ItemRow({
  item,
  changes,
  topics,
  viewerId,
  timeZone,
  returnTo,
}: {
  item: RowItem;
  changes: ChangeRow[];
  topics: Topic[];
  viewerId: string;
  timeZone: string;
  returnTo: string;
}) {
  const removed = !!item.deleted_at;
  const lastEdit = [...changes]
    .filter((c) => c.action !== "create")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return (
    <li className={removed ? "removed" : undefined}>
      <span className="es" lang="es">
        {item.text}
        {(item.kind === "phrase" || item.kind === "grammar") && <span className="k">{item.kind}</span>}
        {removed && <span className="k">removed</span>}
      </span>
      <span className="en">{item.meaning}</span>
      {item.example && (
        <span className="ex" lang="es">
          {item.example}
        </span>
      )}
      {item.kind === "grammar" && item.explanation && <span className="why">{item.explanation}</span>}
      <p className="item-meta">
        Added by {who(item.created_by, item.created_by_name, viewerId, "a former tutor")}
        {lastEdit &&
          `. ${removed ? "Removed" : "Last edited"} by ${who(lastEdit.actor_id, lastEdit.actor_name, viewerId, "someone")}, ${whenText(lastEdit.at, timeZone)}`}
        .
      </p>
      <div className="item-actions">
        {!removed && <ItemEditor item={item} topics={topics} returnTo={returnTo} />}
        <details className="mini">
          <summary>History</summary>
          <div className="mini-body">
            <ItemHistory changes={changes} viewerId={viewerId} timeZone={timeZone} returnTo={returnTo} />
          </div>
        </details>
      </div>
    </li>
  );
}
