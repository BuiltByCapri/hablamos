"use client";

// Upload lesson material, review the draft items Claude extracted, edit them
// and publish. One screen for both roles: a tutor publishes to a linked
// student, a student adds to their own material. The server decides which it
// is, so this only changes the wording.
import { useState, type FormEvent } from "react";
import { shrinkImage, TOO_LARGE_MESSAGE, uploadVerdict } from "../lib/client-upload";
import type { DraftItem, Kind } from "../lib/extract";
import { Field } from "./Field";

type Topic = { id: string; name: string };
type Row = { key: number; item: DraftItem };

const NEW = "__new";
const KIND_LABEL: Record<Kind, string> = { word: "Word", phrase: "Phrase", grammar: "Grammar" };

const EXTRACT_ERRORS: Record<number, string> = {
  401: "You were signed out. Sign in again.",
  403: "You can't add material for this student.",
  409: "This material was already published.",
  413: TOO_LARGE_MESSAGE,
  415: "That file type isn't supported. Use a photo, PDF, Word file or text.",
  429: "You've reached today's limit. Try again tomorrow.",
  502: "Couldn't read that right now. Try again in a minute.",
};

const PUBLISH_ERRORS: Record<number, string> = {
  401: "You were signed out. Sign in again.",
  403: "You can't publish to this student.",
  404: "This draft is gone. Upload the material again.",
  409: "This was already published.",
};

export function DraftReview({
  studentId,
  studentName,
  topics,
  role,
  doneHref,
}: {
  studentId: string;
  studentName?: string;
  topics: Topic[];
  role: "tutor" | "student";
  doneHref: string;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [lessonDate, setLessonDate] = useState("");
  const [busy, setBusy] = useState<"extract" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const tutor = role === "tutor";

  async function extract(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!text.trim() && !file) {
      setError("Paste some text or choose a file.");
      return;
    }
    setBusy("extract");
    try {
      let upload = file;
      if (upload) {
        const verdict = uploadVerdict(upload);
        if (verdict === "too_large") throw new Error(TOO_LARGE_MESSAGE);
        if (verdict === "shrink") upload = await shrinkImage(upload);
      }
      const form = new FormData();
      form.set("studentId", studentId);
      if (text.trim()) form.set("text", text);
      if (upload) form.set("file", upload);
      if (hint.trim()) form.set("categoryHint", hint.trim());
      const res = await fetch("/api/extract", { method: "POST", body: form });
      if (!res.ok) {
        setError(EXTRACT_ERRORS[res.status] ?? "Something went wrong reading that. Try again.");
        return;
      }
      const body = (await res.json()) as { uploadId: string | null; items: DraftItem[] };
      if (!body.uploadId || body.items.length === 0) {
        setNotice("Nothing to learn was found in that material.");
        return;
      }
      setUploadId(body.uploadId);
      setRows(body.items.map((item, key) => ({ key, item })));
    } catch (err) {
      setError(err instanceof Error && err.message === TOO_LARGE_MESSAGE ? TOO_LARGE_MESSAGE : "Something went wrong reading that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const edit = (key: number, patch: Partial<DraftItem>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, item: { ...r.item, ...patch } } : r)));

  async function publish() {
    if (!uploadId) return;
    setError(null);
    setBusy("publish");
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uploadId, items: rows.map((r) => r.item), lessonDate: lessonDate || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? PUBLISH_ERRORS[res.status] ?? "Couldn't publish. Try again.");
        return;
      }
      const body = (await res.json()) as { itemCount: number };
      setDone(body.itemCount);
      setRows([]);
      setUploadId(null);
    } catch {
      setError("Couldn't publish. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setDone(null);
    setText("");
    setFile(null);
    setHint("");
    setLessonDate("");
    setNotice(null);
  }

  const messages = (
    <>
      {notice && (
        <p role="status" className="flash">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="flash flash-error">
          {error}
        </p>
      )}
    </>
  );

  if (done !== null) {
    return (
      <>
        <section className="sheet letter">
          <p role="status">
            {tutor
              ? `Published ${done} ${done === 1 ? "item" : "items"}${studentName ? ` to ${studentName}` : ""}.`
              : `Added ${done} ${done === 1 ? "item" : "items"} to your material.`}
          </p>
        </section>
        <div className="pair-buttons">
          <a href={doneHref} className="btn">
            Done
          </a>
          <button type="button" className="primary" onClick={startOver}>
            Add more material
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {!uploadId && (
        <form onSubmit={extract} aria-labelledby="upload-heading">
          <div className="sheet ruled upload">
            <h2 id="upload-heading" className="mono from-line">
              {tutor ? "The lesson" : "Your material"}
            </h2>
            <label htmlFor="upload-text" className="sr-only">
              Paste text
            </label>
            <textarea
              id="upload-text"
              className="writing"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={tutor ? "Paste the lesson notes here" : "Paste your lesson or notes here"}
            />
            <div className="attach">
              <input
                id="upload-file"
                type="file"
                accept="image/*,.pdf,.docx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="upload-file">{file ? "Attach a different file" : "Attach a photo, PDF or document"}</label>
              {file && <span className="filename">{file.name}</span>}
            </div>
            <Field label="What is it about?" note="optional">
              <input value={hint} onChange={(e) => setHint(e.target.value)} maxLength={200} />
            </Field>
          </div>
          {messages}
          <button type="submit" className="primary wide" disabled={busy !== null}>
            {busy === "extract" ? "Reading..." : tutor ? "Read material" : "Read my material"}
          </button>
        </form>
      )}

      {uploadId && (
        <section aria-labelledby="review-heading">
          <h2 id="review-heading" className="title">
            {rows.length} {rows.length === 1 ? "item" : "items"} to check
          </h2>
          <p className="lede">Fix anything that looks wrong and remove what you don't want.</p>
          <div className="sheet drafts-sheet">
            <ul className="drafts">
              {rows.map(({ key, item }, n) => {
                const choice = "existingId" in item.topic ? item.topic.existingId : NEW;
                return (
                  <li key={key} className="draft" aria-label={`Item ${n + 1}`}>
                    <input
                      className="es"
                      aria-label="Spanish"
                      value={item.text}
                      lang="es"
                      onChange={(e) => edit(key, { text: e.target.value })}
                    />
                    <input
                      className="en"
                      aria-label="Meaning"
                      value={item.meaning}
                      onChange={(e) => edit(key, { meaning: e.target.value })}
                    />
                    <input
                      className="ex full"
                      aria-label="Example"
                      placeholder="Example"
                      value={item.example ?? ""}
                      lang="es"
                      onChange={(e) => edit(key, { example: e.target.value || null })}
                    />
                    {item.kind === "grammar" && (
                      <textarea
                        className="full"
                        aria-label="Explanation"
                        placeholder="Explanation"
                        rows={2}
                        value={item.explanation ?? ""}
                        onChange={(e) => edit(key, { explanation: e.target.value || null })}
                      />
                    )}
                    <div className="draft-tools">
                      <select
                        aria-label="Kind"
                        value={item.kind}
                        onChange={(e) => {
                          const kind = e.target.value as Kind;
                          edit(key, { kind, explanation: kind === "grammar" ? item.explanation : null });
                        }}
                      >
                        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Topic"
                        value={choice}
                        onChange={(e) =>
                          edit(key, {
                            topic: e.target.value === NEW ? { newName: "" } : { existingId: e.target.value },
                          })
                        }
                      >
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                        <option value={NEW}>New topic</option>
                      </select>
                      <button
                        type="button"
                        className="link link-mono link-red"
                        onClick={() => setRows((rs) => rs.filter((r) => r.key !== key))}
                      >
                        Remove
                      </button>
                    </div>
                    {"newName" in item.topic && (
                      <Field label="New topic name" className="full">
                        <input value={item.topic.newName} onChange={(e) => edit(key, { topic: { newName: e.target.value } })} />
                      </Field>
                    )}
                  </li>
                );
              })}
            </ul>
            {tutor && (
              <Field label="Lesson date" note="optional">
                <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />
              </Field>
            )}
          </div>
          <div className="dock">
            {messages}
            <button type="button" className="primary wide" onClick={publish} disabled={busy !== null || rows.length === 0}>
              {busy === "publish" ? "Saving..." : tutor ? `Publish to ${studentName ?? "student"}` : "Add to my material"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
