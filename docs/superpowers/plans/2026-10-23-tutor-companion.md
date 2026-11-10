# Hablamos Tutor Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Hablamos voice app and the Hablamos planner into one signed-in study companion where tutors upload lesson material, students study it, and progress is recorded only from real study.

**Architecture:** A Next.js App Router app replaces the single `index.html` in this repo, on the same Vercel project. Supabase holds accounts, material and study records, with row-level security deciding what a student and a linked tutor can see. Claude does two jobs through forced tool calls: extracting items from uploads, and running voice practice. Pure logic (progress scoring, reminder timing, planner import parsing, session rules) lives in small `lib/` modules with unit tests.

**Tech Stack:** Next.js 16 (App Router, TypeScript), React 19, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Anthropic Messages API over `fetch`, Resend for email, Vitest, Playwright for one end-to-end smoke test. Node 24 (already pinned in `package.json`).

**Spec:** `docs/superpowers/specs/2026-10-23-tutor-companion-design.md`

## Global Constraints

- Sign-in is an email link only. No passwords. `APP_PASSCODE` is removed everywhere.
- Kinds are exactly `word`, `phrase`, `grammar`. Grammar items are never flashcards.
- One primary topic per item. No multi-topic tagging.
- Topic never decides kind.
- Target language and accent are student settings. No language string is hard-coded in a prompt.
- Spanish-only reference tools (alphabet, conjugator, pronunciation respelling) render only when the student's language is `es`.
- A tutor never reads `notes`. A tutor reads nothing for a student without an `active` link.
- Unlinking a tutor deletes no student data and changes no other tutor's access.
- Student-centered: every student-owned row references the student with `on delete cascade` and any tutor with `on delete set null`. A tutor deleting their account removes none of a student's items, lessons, sessions or history. `lessons.publisher_name` and `items.created_by_name` snapshot the name so the source still shows.
- Every change to items, topics, lessons and level/focus writes a `change_log` row with actor, before and after. Items are soft-deleted (`deleted_at`), never hard-deleted except by account deletion.
- "New" = items from the most recently **published** lesson (by `published_at`, never `lesson_date`) with no `session_results` row. Edits never reset it.
- Quiet hours default 21:00 to 08:00 student-local. Nothing is emailed inside them except a daily nudge the student scheduled there.
- Only successful Claude calls count toward the cap.
- `came_up` is its own outcome. It is never counted as right or missed.
- Opening the app without studying creates no session.
- Uploads are capped at 10 MB.
- Per-user daily cap on Claude calls: `CLAUDE_DAILY_CAP`, default `300`.
- Email only for reminders and publish notices. No SMS.
- Claude model from `CLAUDE_MODEL`, default `claude-sonnet-4-6`, as today.
- No streak counter anywhere. Missing a day is never shown as a failure.

## Review Focus

1. **Importing the planner file twice:** the second run adds nothing. Test in Task 12.
2. **An unlinked tutor:** gets empty results for that student on every table, and the student's history is still there. Test in Task 3.
3. **Claude naming an item id that is not the student's in a voice reply:** the id is dropped, not saved. Test in Task 9.
4. **An upload Claude finds nothing in** (a blurry photo, an empty doc): the tutor sees "nothing found" and nothing is published. Test in Task 5.
5. **Reminder hours across a daylight-saving change:** a daily nudge at 19:00 local still goes out at 19:00 local. Test in Task 11.

---

## File Structure

```
app/
  layout.tsx, page.tsx                 home: new since last lesson, then topics
  sign-in/page.tsx                     email link form
  auth/callback/route.ts               Supabase code exchange
  settings/page.tsx                    language, accent, voice, level, focus, time zone, reminders, import, delete account
  topics/[id]/page.tsx                 one topic's items, rename, merge
  add/page.tsx                         student: add one item or upload
  flashcards/page.tsx
  practice/page.tsx                    voice practice
  progress/page.tsx                    student history and words to revisit
  notes/page.tsx                       private notes
  reference/page.tsx                   alphabet, conjugator, pronunciation, dictionary
  tutor/page.tsx                       tutor: student list and invites
  tutor/[studentId]/page.tsx           tutor view of one student
  tutor/[studentId]/upload/page.tsx    tutor upload, review, publish
  invite/[token]/page.tsx              student accepts an invite
  api/extract/route.ts                 upload -> draft items
  api/publish/route.ts                 draft -> lesson + items, sends notice
  api/chat/route.ts                    voice practice turn (replaces api/chat.js)
  api/sessions/route.ts                start, finish, results
  api/import/route.ts                  planner export file -> items, lessons, settings
  api/cron/reminders/route.ts          hourly, CRON_SECRET
lib/
  supabase/server.ts, client.ts, admin.ts
  db-types.ts                          generated from the schema
  claude.ts                            callClaude(), usage cap
  extract.ts                           extraction prompt and tool
  practice-prompt.ts                   voice system prompt from settings and items
  sessions.ts                          session rules
  progress.ts                          right vs missed, words to revisit, summary inputs
  reminders.ts                         who is due this hour
  planner-import.ts                    parse the planner export
  email.ts                             Resend wrapper
  spanish/pronounce.ts, conjugate.ts, alphabet.ts   ported from the planner
components/                            one per screen piece, named after what it shows
supabase/migrations/0001_schema.sql, 0002_rls.sql, ... 0006_publish.sql, 0007_speaking.sql, 0008_cron.sql
tests/unit/*.test.ts                   Vitest, pure modules
tests/rls/*.test.ts                    Vitest against a Supabase dev project
tests/e2e/smoke.spec.ts                Playwright
legacy/index.html                      the old voice app, kept for reference until Task 9 ships
```

Planner repo (`BuiltByCapri/hablamos-plan`): `index.html` gains the export button (Task 12).

## Data model (Task 2 creates it; every later task uses these names)

| table | columns |
|---|---|
| `profiles` | `id` (= auth user), `email`, `display_name`, `is_tutor bool`, `language text default 'es'`, `accent text default 'es-MX'`, `voice text`, `level text`, `level_updated_by uuid`, `level_updated_at`, `focus text`, `focus_updated_by uuid`, `focus_updated_at`, `timezone text default 'America/New_York'`, `reminder_mode text check in ('daily','quiet','off') default 'off'`, `reminder_hour int`, `reminder_quiet_days int`, `quiet_start int default 21`, `quiet_end int default 8`, `created_at` |
| `tutor_links` | `id`, `tutor_id`, `student_id null`, `invite_email`, `invite_token unique`, `status check in ('invited','active','ended')`, `created_at`, `ended_at` |
| `topics` | `id`, `student_id`, `name`, `merged_into uuid null`, `merged_at null`, `created_at`, unique (`student_id`, lower(`name`)) where `merged_into is null` |
| `lessons` | `id`, `student_id`, `tutor_id null`, `published_by uuid`, `publisher_name text`, `published_at timestamptz`, `lesson_date date`, `source check in ('tutor','student','import')`, `import_key text null`, unique (`student_id`, `import_key`) |
| `uploads` | `id`, `student_id`, `uploader_id`, `content_hash text`, `extract_version text`, `status check in ('draft','published','discarded')`, `lesson_id null`, `created_at`, unique (`student_id`, `uploader_id`, `content_hash`, `extract_version`) |
| `draft_items` | `id`, `upload_id`, `kind`, `text`, `meaning`, `example`, `explanation`, `topic_id null`, `new_topic_name null` |
| `items` | `id`, `student_id`, `topic_id`, `kind check in ('word','phrase','grammar')`, `text`, `meaning`, `example null`, `explanation null`, `created_by uuid`, `created_by_name text`, `created_by_role check in ('tutor','student')`, `last_edited_by uuid null`, `last_edited_at null`, `deleted_at null`, `lesson_id null`, `import_key text null`, `created_at`, unique (`student_id`, `import_key`) |
| `sessions` | `id`, `student_id`, `mode check in ('flashcards','voice')`, `started_at`, `ended_at null`, `duration_s int null`, `counted bool default false` |
| `session_results` | `session_id`, `item_id`, `outcome check in ('right','missed','came_up')`, `at timestamptz` |
| `speaking_patterns` | `id`, `student_id`, `name`, `created_at`, unique (`student_id`, lower(`name`)). Added in Task 9 by `0007_speaking.sql`. |
| `speaking_mistakes` | `id`, `student_id`, `session_id`, `pattern_id`, `said text`, `fix text`, `at timestamptz`. Added in Task 9. Student reads and writes their own; a linked tutor reads. |
| `change_log` | `id`, `student_id`, `entity check in ('item','topic','lesson','profile')`, `entity_id`, `actor_id`, `action check in ('create','edit','remove','restore','rename','merge','unmerge')`, `before jsonb`, `after jsonb`, `at`. Append-only: no update or delete policy for anyone, and a trigger rejects updates. |
| `notifications` | `id`, `student_id`, `kind check in ('publish','daily','quiet')`, `dedupe_key text unique`, `payload jsonb`, `send_after timestamptz`, `claimed_at null`, `sent_at null`. The unique key is the duplicate guard. A send claims a row with `update ... set claimed_at = now() where id = $1 and claimed_at is null returning *`, so two overlapping runs cannot both send it. |
| `notes` | `id`, `student_id`, `body`, `created_at`, `updated_at` |
| `claude_usage` | `user_id`, `day date`, `calls int` (successful calls only), primary key (`user_id`, `day`) |

A helper SQL function `is_linked_tutor(student uuid) returns bool` is true when `auth.uid()` has an `active` link to `student`.

---

### Task 1: Next.js app in place of the single page

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx` (placeholder "Hablamos"), `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `tests/unit/smoke.test.ts`, `.env.example`
- Modify: `package.json` (deps, scripts `dev`, `build`, `test`, `test:rls`, `e2e`), `README.md`
- Move: `index.html` -> `legacy/index.html`, `api/chat.js` -> `legacy/chat.js`

- [ ] **Step 1:** `tests/unit/smoke.test.ts` asserts `1 + 1 === 2`. Run `npm test`. Expected: FAIL (no Vitest yet).
- [ ] **Step 2:** Add Next 16, React 19, TypeScript, Vitest. Move the old files. `.env.example` lists `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_DAILY_CAP`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `APP_URL`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_ANON_KEY`.
- [ ] **Step 3:** Run `npm test` and `npm run build`. Expected: PASS, build succeeds.
- [ ] **Step 4:** README: what the app is now, env vars, that the Vercel project's framework preset must change to Next.js. Commit `app: next.js shell, old voice page moved to legacy/`.

### Task 2: Schema and row-level security

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_rls.sql`, `lib/db-types.ts`, `tests/rls/helpers.ts`, `tests/rls/ownership.test.ts`

**Interfaces:**
- Produces: the tables and `is_linked_tutor(uuid)` above. `tests/rls/helpers.ts` exports `makeUser(email: string, opts?: { tutor?: boolean }): Promise<{ id: string; client: SupabaseClient }>` (admin-creates the user, returns a client signed in as them) and `link(tutorId: string, studentId: string, status?: 'active'|'invited'|'ended')`.

RLS tests run against a separate Supabase dev project (no Docker on this machine), via `SUPABASE_TEST_*`. `npm run test:rls` applies the migrations to it first.

- [ ] **Step 1: Failing tests** in `tests/rls/ownership.test.ts`:
  - `student reads own items`: student A inserts an item, selects it, gets 1 row.
  - `stranger reads nothing`: student B selects A's items, gets 0 rows.
  - `active tutor reads items, sessions, session_results, topics, lessons`: each returns A's rows.
  - `tutor never reads notes`: active tutor selects A's notes, gets 0 rows.
  - `invited tutor reads nothing`: link status `invited`, every table returns 0 rows.
  - `tutor can update an item and cannot delete a session`.
- [ ] **Step 2:** Run `npm run test:rls`. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write both migrations. Students have full access to their own rows in every student-owned table. Tutors get `select` on `topics`, `lessons`, `items`, `sessions`, `session_results` and `change_log` via `is_linked_tutor`, plus `update` on `items`, `topics` and `lessons`, plus insert/update on `uploads` and `draft_items` for linked students. `notes` and `claude_usage` are owner only. Generate `lib/db-types.ts` with `supabase gen types` (via `npx supabase`).
- [ ] **Step 4:** Run `npm run test:rls`. Expected: PASS.
- [ ] **Step 5:** Commit `db: schema and row-level security`.

### Task 3: Sign-in, profiles, tutor links, account deletion

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `proxy.ts` (route protection), `app/sign-in/page.tsx`, `app/auth/callback/route.ts`, `app/tutor/page.tsx`, `app/invite/[token]/page.tsx`, `app/settings/page.tsx` (profile fields and delete account only; reminders and import arrive in Tasks 11 and 12), `tests/rls/links.test.ts`

**Interfaces:**
- Produces: `getServerClient(): SupabaseClient`, `getAdminClient(): SupabaseClient`, `requireUser(): Promise<{ user, profile }>` (redirects to `/sign-in` when signed out). Server actions `inviteStudent(email: string)`, `acceptInvite(token: string)`, `unlink(linkId: string)`, `deleteAccount()`, `updateSharedSetting(studentId: string, field: 'level'|'focus', value: string)`. Settings show "last changed by <name>, <date>" under level and focus.

- [ ] **Step 1: Failing tests** in `tests/rls/links.test.ts`:
  - `accepting an invite activates the link and sets student_id`.
  - `ended link: tutor reads 0 rows on every table, student still reads all their items and sessions` (Review Focus 2).
  - `with two active tutors, unlinking one leaves the other reading every table as before`.
  - `a linked tutor can change level and focus through updateSharedSetting, which sets *_updated_by to the tutor and writes change_log`.
  - `a student with zero tutors can still insert items with created_by_role 'student'`.
  - `deleteAccount removes the student's rows in every table`.
  - `a tutor deleting their account leaves every item and lesson they published for the student, with publisher_name intact`.
- [ ] **Step 2:** Run `npm run test:rls`. Expected: FAIL.
- [ ] **Step 3:** Build sign-in with `signInWithOtp` (email link), callback exchange, a profile row created on first sign-in (trigger or callback), a "I'm a tutor" toggle in settings, invites emailed through `lib/email.ts` (`sendEmail(to: string, subject: string, text: string): Promise<void>`, Resend), invite accept page, unlink on both sides, delete account through the admin client.
- [ ] **Step 4:** Run `npm run test:rls`. Expected: PASS. Sign in locally with a real email link and reach `/`.
- [ ] **Step 5:** Commit `auth: email link sign-in, tutor invites, unlinking, account deletion`.

### Task 4: Claude client with the daily cap

**Files:**
- Create: `lib/claude.ts`, `tests/unit/claude.test.ts`

**Interfaces:**
- Produces: `callClaude<T>(args: { userId: string; system: string; messages: { role: 'user'|'assistant'; content: string | ContentBlock[] }[]; tool: { name: string; description: string; input_schema: object }; maxTokens?: number }): Promise<T>`. Throws `ClaudeCapError` when the user's `claude_usage.calls` for today has reached `CLAUDE_DAILY_CAP`, and `ClaudeUpstreamError` otherwise. Always forces `tool_choice` to the given tool and returns its `input`.

- [ ] **Step 1: Failing tests** with `fetch` and the usage store mocked: `returns the forced tool's input`, `increments today's usage on success`, `does not increment usage on an upstream error or a timeout`, `throws ClaudeCapError at the cap`, `throws ClaudeUpstreamError on non-2xx`.
- [ ] **Step 2:** `npm test -- claude`. Expected: FAIL.
- [ ] **Step 3:** Implement. The day is the UTC date.
- [ ] **Step 4:** `npm test -- claude`. Expected: PASS.
- [ ] **Step 5:** Commit `claude: one client, forced tools, daily cap`.

### Task 5: Extraction

**Files:**
- Create: `lib/extract.ts`, `app/api/extract/route.ts`, `tests/unit/extract.test.ts`

**Interfaces:**
- Consumes: `callClaude` (Task 4).
- Produces: `type DraftItem = { kind: 'word'|'phrase'|'grammar'; text: string; meaning: string; example: string | null; explanation: string | null; topic: { existingId: string } | { newName: string } }`. `extractItems(args: { userId: string; language: string; existingTopics: { id: string; name: string }[]; content: { text?: string; file?: { mediaType: string; base64: string } }; categoryHint?: string }): Promise<DraftItem[]>`. `POST /api/extract` takes multipart (`studentId`, `text?`, `file?`), checks the caller is the student or a linked tutor, rejects files over 10 MB with 413, fingerprints the content (SHA-256 of the text or file bytes) and pairs it with `EXTRACT_VERSION`, a constant in `lib/extract.ts` made of a prompt version string and the model name. When an upload with that fingerprint and version already exists for this uploader and student, it returns that upload's draft items without calling Claude; otherwise creates an `uploads` row (`draft`) and its `draft_items`. Returns `{ uploadId, items: DraftItem[] }`. A failed Claude call leaves no upload row, so a retry starts clean.

The extraction tool is `save_items` with an `items` array matching `DraftItem`. The prompt states the kinds and their definitions, says topic and kind are independent, lists existing topics by id and name, and requires `existingId` whenever an existing topic fits before any `newName`. Images go in as image blocks, PDFs as document blocks, `.docx` converted to text first with `mammoth`.

- [ ] **Step 1: Failing tests** (Claude mocked):
  - `drops an existingId that is not in existingTopics and falls back to newName from the model's name field`.
  - `rejects a kind outside word, phrase, grammar`.
  - `empty extraction returns []` and the route responds `{ uploadId: null, items: [] }` without creating an upload (Review Focus 4).
  - `prompt contains every existing topic name and the student's language`.
  - `the same content uploaded twice calls Claude once` (route test with Claude mocked).
  - `one changed character calls Claude again`, and `a new EXTRACT_VERSION calls Claude again for identical content`.
- [ ] **Step 2:** `npm test -- extract`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -- extract`. Expected: PASS. Run one real extraction on a pasted paragraph of lesson notes.
- [ ] **Step 5:** Commit `extract: lesson material to draft items with topic suggestions`.

### Task 6: Review, publish, and student additions

**Files:**
- Create: `app/tutor/[studentId]/upload/page.tsx`, `components/DraftReview.tsx`, `app/api/publish/route.ts`, `app/add/page.tsx`, `tests/rls/publish.test.ts`

**Interfaces:**
- Consumes: `/api/extract` (Task 5), `sendEmail` (Task 3).
- Produces: `POST /api/publish` with `{ uploadId, items: DraftItem[] (edited), lessonDate?: string }`. Creates new topics, one `lessons` row (`source` = `tutor` or `student`, `tutor_id` set for tutors, `published_by`, `published_at = now()`), the `items` (`created_by`, `created_by_role` from the caller), a `change_log` `create` row per item, marks the upload `published`. When a tutor publishes, inserts a `notifications` row (`kind 'publish'`, `dedupe_key 'publish:'+lessonId`, `send_after` now or the end of quiet hours); Task 11 sends it. Server action `addItem(item: Omit<DraftItem,'topic'> & { topicId?: string; newTopicName?: string })` for a single hand-added item.

Tutor flow: upload, see drafts, edit text, meaning, example, kind, topic (pick existing or type new), remove, publish. Student flow on `/add`: the same screen, but publish happens in the same step with no review, since spec says no approval for student additions. Independent learners use `/add`.

- [ ] **Step 1: Failing tests**: `tutor publish creates one lesson with tutor_id and published_by and items with created_by_role 'tutor'`, `student publish creates items with created_by_role 'student' and no tutor_id`, `tutor publish queues exactly one publish notification`, `publishing twice with the same uploadId is rejected`, `a tutor cannot publish to a student they are not actively linked to`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Walk the tutor flow in the browser with two accounts.
- [ ] **Step 5:** Commit `publish: tutor review and publish, student additions`.

### Task 7: Home, topics, items, notes

**Files:**
- Create: `app/page.tsx` (replace placeholder), `app/topics/[id]/page.tsx`, `components/ItemRow.tsx`, `components/ItemEditor.tsx`, `app/notes/page.tsx`, `lib/material.ts`, `tests/unit/material.test.ts`

**Interfaces:**
- Produces: `newItems(items: Item[], lessons: Lesson[], studiedItemIds: Set<string>): Item[]` (non-deleted items whose lesson is the one with the latest `published_at`, minus studied ids). Server actions, each writing `change_log` with before and after: `renameTopic(id, name)`, `mergeTopics(fromId, intoId)` (moves items, sets `fromId.merged_into`, logs the exact moved item ids; `fromId` is kept, not deleted), `undoMerge(changeId)` (clears `merged_into`, moves exactly the logged item ids back, logs `unmerge`; item ids never change, so no session result is copied or lost), `updateItem(id, patch)` (sets `last_edited_by`, `last_edited_at`), `removeItem(id)` (sets `deleted_at`), `restoreItem(changeId)` (writes the `before` of that change as a new current version, logged as `restore`; earlier and later `change_log` rows are untouched), `updateLessonDate(lessonId, date)`. `ItemHistory` component lists an item's changes with actor and time and a restore button on each.

- [ ] **Step 1: Failing tests**: `newItems returns only the latest-published lesson's unstudied items`, `returns [] when there are no lessons`, `moving an older lesson's date later does not make its items new`, `an edited item that was studied stays not new`, `removed items are never new`, `mergeTopics leaves no item pointing at the merged topic and undoMerge restores the original topic and its exact items` (pure helpers `planMerge`, `planUndoMerge` over arrays), `undoMerge leaves an item added to the merged topic after the merge where it is`, and in `tests/rls/history.test.ts`: `a tutor edit then restoreItem makes the original text current and change_log holds create, edit and restore in order`, `updating or deleting a change_log row fails for student and tutor`, `merge then undoMerge leaves session_results counts per item unchanged`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Home shows "New since your last lesson" first, then topics with item counts. Each item shows who created it and, if edited, who last edited it and when. Notes page is plain text entries, student only, and the tutor view never links to it.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `material: home, topics, editing, private notes`.

### Task 8: Sessions and flashcards

**Files:**
- Create: `lib/sessions.ts`, `app/api/sessions/route.ts`, `app/flashcards/page.tsx`, `components/Flashcard.tsx`, `tests/unit/sessions.test.ts`

**Interfaces:**
- Produces: `POST /api/sessions` with `{ action: 'start', mode }` -> `{ sessionId }`; `{ action: 'result', sessionId, itemId, outcome }`; `{ action: 'finish', sessionId }`. `shouldCount(mode: 'flashcards'|'voice', results: { outcome: string }[], spokeOnce: boolean): boolean`: flashcards count with at least one result, voice counts when `spokeOnce`. `finish` sets `ended_at`, `duration_s`, `counted`. A session never finished is closed by `closeIdle(now: Date, sessions)` after 10 minutes of no results (run from the cron in Task 11).

Flashcards include only `word` and `phrase` items, filterable by topic and "new" and "to revisit". The student marks each card right or missed.

- [ ] **Step 1: Failing tests**: `opening flashcards and leaving with no answers is not counted`, `one answer counts`, `voice with spokeOnce false is not counted`, `closeIdle closes a session idle for 10 minutes and not one idle for 9`, `grammar items are excluded from the flashcard deck` (pure `flashcardDeck(items)`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `study: sessions and flashcards`.

### Task 8b: Profile: pronouns, greeting, photo

Added 2026-10-29 (spec section "Profile"). Runs before Task 9.

**Files:**
- Create: `supabase/migrations/0011_profile.sql`, `app/profile/page.tsx`, `lib/profile.ts`, `components/Avatar.tsx`, `tests/unit/profile.test.ts`, `tests/rls/profile.test.ts`
- Modify: `components/Letter.tsx` (stamp and greeting), the tutor student list and nav (Profile link), settings (name moves to Profile)

**Interfaces:**
- Schema: `profiles` gains `pronouns text null` (max 40), `greetings jsonb not null default '{}'` keyed by language code, e.g. `{"es": "querida"}` with values `querida | querido | queride | name`, and `photo_path text null`. A private storage bucket `avatars`, objects at `<user id>/<uuid>.webp`. Writes go through a definer RPC `update_profile(p_display_name, p_pronouns, p_greeting_lang, p_greeting)` that validates lengths and values; photo upload goes through a route that re-encodes to WebP (max 512px, under 1 MB) and sets `photo_path`, deleting the previous object.
- Read policy: a user reads their own photo and any photo of someone they have an `active` link with, either direction. Account deletion removes the user's `avatars/<id>/` objects.
- `greetingLine(profile: { display_name; greetings }, language: string): string`: `querida` gives "Querida {name},", `querido` "Querido {name},", `queride` "Queride {name},", `name` or unset "Hola {name},". Spanish only in v1; any other language returns "{name},".

- [ ] **Step 1: Failing tests**: `greetingLine uses the chosen form`, `greetingLine falls back to Hola when unset`, `update_profile rejects a greeting outside the four values`, `pronouns over 40 characters are rejected`, and in `tests/rls/profile.test.ts`: `a linked tutor can read the student's photo and the student the tutor's`, `an unlinked user cannot read either photo`, `a user cannot overwrite another user's profile or photo`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Profile page in the correspondence style. The letter's postmark area shows the tutor's photo as a postage stamp (perforated edge) when they have one, otherwise the postmark alone.
- [ ] **Step 4:** Run unit, RLS and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `profile: pronouns, greeting, and a photo that becomes the stamp`.

### Task 9: Voice practice on the student's own material

**Files:**
- Create: `lib/practice-prompt.ts`, `lib/speaking.ts`, `app/api/chat/route.ts`, `app/practice/page.tsx`, `components/VoicePractice.tsx`, `supabase/migrations/0007_speaking.sql`, `tests/unit/practice.test.ts`, `tests/unit/speaking.test.ts`, `tests/rls/speaking.test.ts`
- Delete after this ships: `legacy/`

**Interfaces:**
- Consumes: `callClaude`, sessions API.
- Produces: `buildPracticePrompt(profile: { language; accent; level; focus }, items: { id; kind; text; meaning; explanation }[], patterns: string[]): string`. The reply tool keeps `reply_es`, `reply_en`, `correction` (renamed `reply_target`, `reply_en`, `correction`) and adds `items_came_up: string[]`, `items_right: string[]`, `items_missed: string[]` (item ids; right and missed only when the student's own words show it), and `mistakes: { pattern: string; said: string; fix: string }[]` (real errors only, never style suggestions; empty when there were none). `sanitizeItemIds(ids: string[], allowed: Set<string>): string[]`. In `lib/speaking.ts`: `matchPattern(name: string, existing: { id; name }[]): string | null` returns the id of an existing pattern equal after lowercasing, trimming and collapsing whitespace and punctuation, else null.

Port the voice UI from `legacy/index.html`: speech recognition, voice choice, rate, speaking, mic states. The topic picker becomes a choice of the student's topics plus "New since last lesson" and "To revisit". The pasted words box goes away. Each reply saves one result per id: `right` or `missed` where given, otherwise `came_up`. Each mistake is saved to `speaking_mistakes` under a matched pattern, creating the pattern only when `matchPattern` returns null. The prompt lists the student's existing pattern names and tells Claude to reuse one before naming a new one. The session row stays separate and only records mode, timing and whether it counted.

- [ ] **Step 1: Failing tests**: `prompt names the student's language and accent and contains no hard-coded profile` (assert it does not contain "Monday" or "ser vs. estar" unless in focus), `prompt lists grammar items with their explanation as practice prompts`, `prompt lists the student's existing speaking patterns`, `sanitizeItemIds drops ids not in the student's list` (Review Focus 3), `an id in both items_right and items_missed is saved as missed`, `matchPattern matches "Ser vs. estar" to "ser vs estar"`, `matchPattern returns null for a new pattern`, and in `tests/rls/speaking.test.ts`: `a linked tutor reads the student's mistakes`, `an unlinked tutor reads none`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, then delete `legacy/`.
- [ ] **Step 4:** Run. Expected: PASS. Hold one spoken conversation on a phone and check the session is counted with results.
- [ ] **Step 5:** Commit `practice: voice practice on the student's material, results recorded`.

### Task 10: Progress for the student and the tutor view

**Files:**
- Create: `lib/progress.ts`, `app/progress/page.tsx`, `app/tutor/[studentId]/page.tsx`, `tests/unit/progress.test.ts`

**Interfaces:**
- Produces: `itemStats(results: { itemId; outcome; at }[]): Map<string, { right: number; missed: number; cameUp: number; lastOutcome: string; lastAt: Date }>`. `toRevisit(stats, now: Date): string[]`: items missed at least twice in total, or missed in their most recent right-or-missed result, most recent first. `came_up` counts as practiced but never as right. `consistentlyRight(stats): string[]`: at least 3 right and none missed in the last 3. `weekSummary(sessions, now)`: sessions and minutes in the last 7 days. `topPatterns(mistakes: { patternId; patternName; said; fix; at }[], now: Date): { name; count; example: { said; fix } }[]`: the five most frequent patterns in the last 30 days, ties broken by most recent, each with its most recent example. `nextLessonSummary(args): Promise<string>` calls Claude with stats, topics and top patterns only, never notes, for 3 to 5 short lines.

Student page: sessions with date, mode and minutes, minutes this week, words to revisit, and an encouraging line based on what they did, never on what they missed. No streak. Tutor page: sessions completed and when, topics and items practiced, consistently right versus frequently missed, patterns from speaking (`topPatterns`), the next-lesson summary, a link to upload for this student. It shows per-session totals, not per-answer timestamps.

- [ ] **Step 1: Failing tests**: `missed twice is to revisit`, `missed once then right twice is not`, `missed most recently is to revisit`, `3 right with no recent miss is consistently right`, `came_up alone is practiced but neither right nor to revisit`, `came_up never changes a right or missed count`, `weekSummary ignores uncounted sessions`, `topPatterns keeps five, most frequent first`, `topPatterns ignores mistakes older than 30 days`, `topPatterns example is the most recent`, `nextLessonSummary input contains no notes field and includes the top patterns` (assert on the built prompt).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `progress: student history, words to revisit, tutor view`.

### Task 11: Reminders and settings

**Files:**
- Create: `lib/reminders.ts`, `app/api/cron/reminders/route.ts`, `supabase/migrations/0008_cron.sql`, `tests/unit/reminders.test.ts`
- Modify: `app/settings/page.tsx` (reminder mode, hour, quiet days, quiet hours, time zone)

**Interfaces:**
- Produces: `inQuietHours(profile, now): boolean` (handles windows that cross midnight). `nudgeFor(profile, lastCountedSessionAt: Date | null, now: Date): { kind: 'daily'|'quiet'; dedupeKey: string } | null`. Daily: local hour equals `reminder_hour`, key `daily:<student>:<local date>`. Quiet: no counted session for `reminder_quiet_days` days, not in quiet hours, key `quiet:<student>:<lastCountedSessionAt date>` so it is sent once per silence. Off: null. `GET /api/cron/reminders` requires `Authorization: Bearer ${CRON_SECRET}`, inserts due nudges into `notifications` with `on conflict (dedupe_key) do nothing`, sends every unsent notification whose `send_after` has passed and that is outside quiet hours (daily nudges exempt), marks `sent_at` in the same statement that claims it, and runs `closeIdle` from Task 8. `0008_cron.sql` schedules it hourly with `pg_cron` and `pg_net`.

- [ ] **Step 1: Failing tests**: `daily at 19 in America/New_York is due at 23:00 UTC in EDT and 00:00 UTC in EST` (Review Focus 5), `daily has one dedupe key per local day`, `quiet 3 days is due on day 3 and not day 2`, `quiet keeps the same key until a new session happens`, `off is never due`, `inQuietHours is true at 23:00 and 07:00 and false at 08:00 for 21 to 8`, `a publish notice due at 22:00 waits until 08:00`, `running the cron twice in one hour sends each notification once`, and in `tests/rls/notifications.test.ts`: `inserting a second notification with the same dedupe_key fails`, `two concurrent claims of one notification: exactly one returns a row`, `cron rejects a missing or wrong secret`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Reminder copy is short and encouraging and mentions what is new or to revisit.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `reminders: student-chosen nudges, hourly cron`.

### Task 12: Planner export and import

**Files:**
- Modify (planner repo `hablamos-plan`): `index.html`, an **Export my data** button in the "Your data" section that downloads `hablamos-export-YYYY-MM-DD.json`, an object of every `localStorage` key starting `hablamos:` with the prefix removed, values as stored.
- Create (this repo): `lib/planner-import.ts`, `app/api/import/route.ts`, `tests/unit/planner-import.test.ts`, `tests/fixtures/planner-export.json` (exported from the live planner).
- Modify: `app/settings/page.tsx` (Import from the planner).

**Interfaces:**
- Consumes: `extractItems` (Task 5, with `categoryHint`).
- Produces: `parsePlannerExport(json: unknown): { vocab: { es: string; en: string; category: string }[]; lessons: { date: string }[]; settings: { accent?: string; voice?: string } }`. Vocab import keys are `vocab:${lowercase es}`, lesson keys `lesson:${date}`, written to `import_key` so the unique constraints make a second import add nothing.

Read the planner's actual storage keys from its `index.html` before writing the parser; the fixture is the source of truth. Vocab goes through `extractItems` in batches of 50 with the old category as `categoryHint`, then straight to items with `created_by_role 'student'`, under one `lessons` row per logged lesson date and a `source 'import'` lesson for vocab with no date. The streak and checklist keys are ignored.

- [ ] **Step 1: Failing tests**: `parses vocab, lessons and accent from the fixture`, `ignores streak and checklist keys`, `rejects a file that is not a planner export`, `import keys are stable for the same word with different case`, and in `tests/rls/import.test.ts`: `importing the fixture twice leaves the item and lesson counts unchanged` (Review Focus 1).
- [ ] **Step 2:** Run both suites. Expected: FAIL.
- [ ] **Step 3:** Implement both repos.
- [ ] **Step 4:** Run. Expected: PASS. Export from the live planner in Capri's browser and import it into her account.
- [ ] **Step 5:** Commit in each repo: `planner: export my data` and `import: bring the planner's vocab, lessons and settings across`.

### Task 13: Reference tools and the end-to-end smoke test

**Files:**
- Create: `lib/spanish/pronounce.ts`, `lib/spanish/conjugate.ts`, `lib/spanish/alphabet.ts`, `app/reference/page.tsx`, `tests/unit/spanish.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `pronounce(word: string, accent: 'es-MX'|'es-ES'): string`, `conjugate(infinitive: string): Record<'yo'|'tú'|'él'|'nosotros'|'vosotros'|'ellos', string> | null`, ported from the planner's `pronounceWord`, `conjugateVerb`, alphabet data. Dictionary lookup ports `runLookup` (MyMemory, majority translation, alternatives).

- [ ] **Step 1: Failing tests**: `pronounce('cansado','es-MX') === 'kahn-SAH-doh'`, `conjugate('llamarse').yo === 'me llamo'`, `conjugate('tener').yo === 'tengo'`, and the reference page renders nothing Spanish-specific when language is not `es`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Port the functions.
- [ ] **Step 4:** `tests/e2e/smoke.spec.ts`: with a seeded tutor and student, the tutor publishes pasted notes, the student sees them under "New since your last lesson", runs flashcards with one answer, and the tutor view shows one session. Run `npm test && npm run e2e`. Expected: PASS.
- [ ] **Step 5:** Commit `reference: alphabet, conjugator, pronunciation, dictionary; e2e smoke`.

### Task 14: Ship

- [ ] **Step 1:** Create the Supabase production project, apply migrations, set auth redirect URLs to the Vercel domain, set every env var in Vercel, switch the project's framework preset to Next.js.
- [ ] **Step 2:** Deploy, sign in as Capri, import the planner file, invite the tutor's email.
- [ ] **Step 3:** Update README (what it is, how a tutor starts, env vars) and the hablamos-plan README to point at the new app.
- [ ] **Step 4:** Commit `docs: companion is live`.
