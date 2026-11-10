import { removeItemForm, updateItemForm } from "../app/actions";
import { Field } from "./Field";

type Topic = { id: string; name: string };
export type EditableItem = {
  id: string;
  kind: string;
  text: string;
  meaning: string;
  example: string | null;
  explanation: string | null;
  topic_id: string;
};

/** Edit form and remove button for one item. A native <details>, so it needs no script. */
export function ItemEditor({ item, topics, returnTo }: { item: EditableItem; topics: Topic[]; returnTo: string }) {
  return (
    <details className="mini">
      <summary>Edit</summary>
      <div className="mini-body">
        <form action={updateItemForm.bind(null, item.id, returnTo)} className="stack">
          <Field label="Spanish">
            <input name="text" defaultValue={item.text} required lang="es" />
          </Field>
          <Field label="Meaning">
            <input name="meaning" defaultValue={item.meaning} required />
          </Field>
          <Field label="Example">
            <input name="example" defaultValue={item.example ?? ""} lang="es" />
          </Field>
          {item.kind === "grammar" && (
            <Field label="Explanation">
              <textarea name="explanation" defaultValue={item.explanation ?? ""} />
            </Field>
          )}
          <Field label="Topic">
            <select name="topic" defaultValue={item.topic_id}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="row">
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
        <form action={removeItemForm.bind(null, item.id, returnTo)}>
          <button type="submit" className="link link-red">
            Remove this item
          </button>
        </form>
      </div>
    </details>
  );
}
