# Shared context for all tasks

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
| `change_log` | `id`, `student_id`, `entity check in ('item','topic','lesson','profile')`, `entity_id`, `actor_id`, `action check in ('create','edit','remove','restore','rename','merge','unmerge')`, `before jsonb`, `after jsonb`, `at`. Append-only: no update or delete policy for anyone, and a trigger rejects updates. |
| `notifications` | `id`, `student_id`, `kind check in ('publish','daily','quiet')`, `dedupe_key text unique`, `payload jsonb`, `send_after timestamptz`, `claimed_at null`, `sent_at null`. The unique key is the duplicate guard. A send claims a row with `update ... set claimed_at = now() where id = $1 and claimed_at is null returning *`, so two overlapping runs cannot both send it. |
| `notes` | `id`, `student_id`, `body`, `created_at`, `updated_at` |
| `claude_usage` | `user_id`, `day date`, `calls int` (successful calls only), primary key (`user_id`, `day`) |

A helper SQL function `is_linked_tutor(student uuid) returns bool` is true when `auth.uid()` has an `active` link to `student`.

---

## Controller rulings that amend the plan
- Ruling: T6 does not call sendEmail; it queues a `notifications` row and T11 sends it — body and spec (quiet hours, db-enforced dedupe) agree — cost if wrong: a publish notice is delayed up to an hour.
- Ruling: T8 `finish` accepts optional `spokeOnce: boolean` (required true for voice to count) — T9 needs it to apply the spec's rule — cost if wrong: small API change.
- Ruling: T8 `closeIdle(now, sessions)` returns the ids of sessions to close; the caller ends them and sets `counted` via shouldCount — keeps it pure — cost if wrong: trivial refactor.
- Ruling: `change_log.actor_id` is a plain uuid with no FK, plus `actor_name text` snapshot; `student_id` FK cascades on delete. The trigger forbids UPDATE only, so account deletion still works — keeps the log append-only and student-centered — cost if wrong: actor ids can point at deleted users (by design).
- Ruling: `change_log` insert is allowed for the owning student and active linked tutors, with `actor_id = auth.uid()` enforced by the policy; no update or delete for anyone — spec requires attributable, append-only history — cost if wrong: a write path needs the admin client.
- Ruling: T7 also creates `components/ItemHistory.tsx` — the task text names it — cost if wrong: none.
