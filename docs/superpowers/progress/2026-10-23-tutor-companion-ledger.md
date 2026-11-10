# SDD ledger — plan: docs/superpowers/plans/2026-10-23-tutor-companion.md

Spec: docs/superpowers/specs/2026-10-23-tutor-companion-design.md (reachable). Branch feat/tutor-companion from d575e7e.

## Pre-flight scan

| tasks | produces / consumes | finding |
|---|---|---|
| T2 -> T3,T6,T7,T12 | tests/rls/helpers makeUser, link | consistent |
| T3 -> T6 | sendEmail | T6 Interfaces lists sendEmail but its body queues a notifications row instead. Ruling below |
| T3 -> T11 | sendEmail, settings page | consistent; T11 and T12 extend settings sequentially |
| T4 -> T5,T9,T10,T12 | callClaude | consistent |
| T5 -> T6 | DraftItem, /api/extract | consistent |
| T5 -> T12 | extractItems categoryHint | consistent |
| T7 -> T8 | newItems for the "new" deck filter | consistent |
| T8 -> T9 | sessions API, shouldCount(spokeOnce) | finish action has no way to pass spokeOnce. Ruling below |
| T8 -> T11 | closeIdle | return shape unstated. Ruling below |
| T2 -> T3 (deleteAccount, tutor deletion) | change_log append-only trigger vs FK set null | an FK on change_log.actor_id with on delete set null would UPDATE rows the trigger forbids. Ruling below |
| T2 -> T7 | change_log inserts from server actions | no insert policy stated. Ruling below |
| T1 -> T9 | legacy/ removed in T9 | consistent |
| T1 | self | consistent |
| T2 | self | consistent; needs SUPABASE_TEST_* before it can run |
| T3 | self | consistent |
| T4 | self | consistent |
| T5 | self | consistent |
| T6 | self | Interfaces vs body (sendEmail), see ruling |
| T7 | self | mentions ItemHistory component but Files list omits it. Ruling below |
| T8 | self | consistent |
| T9 | self | consistent |
| T10 | self | consistent |
| T11 | self | consistent |
| T12 | self | consistent |
| T13 | self | consistent |
| T14 | self | needs production secrets and Vercel settings: stop and ask at that point |

## Rulings
- Ruling: T6 does not call sendEmail; it queues a `notifications` row and T11 sends it — body and spec (quiet hours, db-enforced dedupe) agree — cost if wrong: a publish notice is delayed up to an hour.
- Ruling: T8 `finish` accepts optional `spokeOnce: boolean` (required true for voice to count) — T9 needs it to apply the spec's rule — cost if wrong: small API change.
- Ruling: T8 `closeIdle(now, sessions)` returns the ids of sessions to close; the caller ends them and sets `counted` via shouldCount — keeps it pure — cost if wrong: trivial refactor.
- Ruling: `change_log.actor_id` is a plain uuid with no FK, plus `actor_name text` snapshot; `student_id` FK cascades on delete. The trigger forbids UPDATE only, so account deletion still works — keeps the log append-only and student-centered — cost if wrong: actor ids can point at deleted users (by design).
- Ruling: `change_log` insert is allowed for the owning student and active linked tutors, with `actor_id = auth.uid()` enforced by the policy; no update or delete for anyone — spec requires attributable, append-only history — cost if wrong: a write path needs the admin client.
- Ruling: T7 also creates `components/ItemHistory.tsx` — the task text names it — cost if wrong: none.
Task 1: minor (deferred): README drops the CLAUDE_MODEL default claude-sonnet-4-6
Task 1: minor (deferred): e2e and test:rls scripts fail until Tasks 2 and 13 add their suites
Task 1: minor (deferred): next-env.d.ts ignored but included by tsconfig
Task 1: ⚠️ resolved: legacy/ still reads APP_PASSCODE; Task 9 deletes legacy/. Build and tests re-checked by controller.
Task 1: complete (commits d575e7e..6637410, review clean)
Task 2: Ruling: ⚠️ is_tutor is self-serve (owner can set it) — the product is sold to tutors who sign up themselves, and the role grants nothing until a student accepts an invite — cost if wrong: add an approval step later.
Task 2: Ruling: ⚠️ carried to Task 3: acceptInvite must match the invite against the auth user's email, never profiles.email.
Task 2: Ruling: reviewer minors on attribution (actor_name client-set; tutors rewriting created_by*/published_* columns) are promoted into the fix loop — spec requires changes to be attributable — cost if wrong: one extra trigger.
Task 2: Ruling: the missing "unlinking ends that tutor's access only, the other tutor keeps theirs" test is promoted — it is a spec line — cost: one test.
Task 2: minor (deferred): cross-student FKs (topics.merged_into, items.lesson_id, uploads.lesson_id, draft_items.topic_id, session_results.item_id) not composite
Task 2: minor (deferred): tutor can supply invite_token/created_at/ended_at on insert
Task 2: minor (deferred): activation test passes on data ?? [] without asserting error
Task 2: minor (deferred): no stranger/tutor insert tests, no tutor-writes-notes test
Task 2: minor (deferred): apply-test-migrations drops all public tables with no project guard; rejectUnauthorized false
Task 2: minor (deferred): MODULE_TYPELESS_PACKAGE_JSON warning in test:rls output
Task 2: fix round 1/5 (7 addressed, 0 open; commits 5a44b06..4cb496b)
Task 2: minor (deferred): unlink test doesn't check secondTutor could read before; uploads/draft_items checks vacuous
Task 2: minor (deferred): change_log actor_name trigger nulls service-role names (imports, admin writes)
Task 2: minor (deferred): lessons_attribution_guard does not cover tutor_id, import_key
Task 2: complete (commits 6637410..4cb496b, review clean)
Task 3: Ruling: ⚠️ legacy/chat.js still reads APP_PASSCODE — Task 9 deletes legacy/ — cost if wrong: none, nothing serves it.
Task 3: ⚠️ confirmed real gap: owner can write level/focus directly and skip change_log (Task 2 policy) — enters fix loop.
Task 3: Ruling: "last changed by" per-field lookup promoted from minor — spec requires showing who last changed each setting — cost: small query change.
Task 3: minor (deferred): one RPC per linked student on tutor page
Task 3: minor (deferred): already-linked check matches invite_email only
Task 3: minor (deferred): no invite rate limit (matters once Resend live)
Task 3: minor (deferred): next dev creates untracked AGENTS.md
Task 3: Ruling: Task 11's cron migration becomes 0004_cron.sql (0003 taken by shared settings guard) — numbering only — cost: none.
Task 3: fix round 1/5 (3 addressed, 1 open — dot-segment open redirect '/.//evil' via same-path.ts output; commits d6690a8..11dd94f)
Task 3: fix round 2/5 (1 addressed, 0 open; commits 11dd94f..249c5c0; fuzzed 2M inputs, no bypass)
Task 3: minor (deferred): cosmetic test ordering in callback-route.test.ts and a redundant safe-next case
Task 3: complete (commits 4cb496b..249c5c0, review clean)
Task 4: Ruling: atomic usage increment via migration 0004_claude_usage_increment.sql, service_role only; Task 11 cron becomes 0005_cron.sql — concurrency-safe cap — cost: none.
Task 4: ⚠️ resolved: claude_usage has primary key (user_id, day) and cascades from profiles.
Task 4: minor (deferred): cap test hard-codes 300 without stubbing CLAUDE_DAILY_CAP
Task 4: minor (deferred): increment/read failures surface as plain Error; routes must map untyped errors to 500 (carry to Tasks 5, 9)
Task 4: minor (deferred): cap check and increment not jointly atomic, overshoot up to N-1 concurrent calls
Task 4: minor (deferred): revoke test asserts any error, not 42501
Task 4: complete (commits 249c5c0..bf727e9, review clean)
Task 5: Ruling: cache reuse returns drafts for a draft upload, re-extracts a discarded one in place, and 409s a published one — the unique key spans status, so a published fingerprint cannot be re-inserted — cost if wrong: a tutor re-uploading identical published notes gets a message instead of new drafts.
Task 5: Ruling: real extraction smoke run only if ANTHROPIC_API_KEY is set locally — no key available — cost: first real run happens at Task 14.
Task 5: Ruling: Vercel's ~4.5 MB request body limit — Task 6's upload UI downscales photos client-side to under 4 MB; PDFs and docs over 4 MB get a clear "too large, split or export smaller" message; the 10 MB server cap stays — lesson notes rarely exceed 4 MB and direct-to-Storage uploads are a bigger build — cost if wrong: a 4-10 MB PDF can't be uploaded in v1.
Task 5: Ruling: Task 6 publish must resolve topic ids through merged_into — cached drafts can predate a merge — cost: one lookup.
Task 5: Ruling: Task 11 cron migration becomes 0007_cron.sql (0005 taken by draft_items.position, 0006 by Task 9 speaking patterns, added 2026-10-28) — numbering only.
Task 5: paused 2026-10-26 before task review. Next: review bf727e9..f72df45 against task-5 brief, then Task 6.

Note 2026-10-26: branch commits were re-authored to the GitHub noreply email so Vercel deploys them. Old to new SHAs: 6637410->1c786f8, 5a44b06->760006a, 4cb496b->dc82409, d6690a8->9c393f7, 11dd94f->9c35892, 249c5c0->9f76509, bf727e9->f45bb1b, f72df45->cd1d202. Task 5 review range is now f45bb1b..cd1d202.
Task 5: review 2026-10-29: spec compliant, approved, no Critical or Important.
Task 5: minor (deferred): mark-discarded update error ignored at lib/extract.ts:555; empty txt/docx still calls Claude; corrupt docx gives 500 not 422; Claude timeout equals maxDuration (use ~100 s); fingerprint ignores categoryHint; no 413 test for oversized pasted text.
Task 5: Ruling: proxy now answers /api/* with 401 JSON — sensible, kept — Task 11's cron route must be in PUBLIC_PATHS and check CRON_SECRET itself — cost if missed: cron gets 401 every hour.
Task 5: complete (commits f45bb1b..cd1d202, review approved)
Task 6: implemented e917e7b (base 90237eb). RLS suite not run: hablamos .env.test.local was lost; Capri asked to re-paste keys 2026-10-29.
Task 6: Ruling: migration is 0006_publish.sql, so Task 9 speaking becomes 0007_speaking.sql and Task 11 cron 0008_cron.sql — numbering only.
Task 6: review approved, no Critical or Important.
Task 6: Ruling: quiet-hours send_after trusted the caller and failed open — promoted from minor, it breaks a global constraint — cost: SQL computes it.
Task 6: Ruling: lesson date defaulted to UTC date — promoted, a student sees the wrong date after 20:00 local — cost: one expression.
Task 6: Ruling: vacuous double-publish assertion and run-order-dependent test — promoted, tests that assert nothing are Important by rubric.
Task 6: minor (deferred): uploader can flip a published upload back to draft by direct update and republish (needs a status guard trigger); topic-name race gives 500; email used as display-name fallback in snapshots; bad_topic/bad_item show a generic message; edited drafts not saved back.
Task 6: Ruling: hand-added items are never "new" and a student's own upload becomes the latest lesson — matches the spec's definition of new — cost if wrong: a spec question for Capri.
Task 6: fix round 1/5 (3 addressed, 0 open; commit 83a8df4). Scoped re-review done by controller on the SQL diff: send_after and lesson date now computed in SQL from the student's profile, fail closed, crossing-midnight handled; tests strengthened.
Task 6: complete pending RLS (commits 90237eb..83a8df4). Gate: run npm run test:rls once .env.test.local is restored, before Task 7 relies on publish.
Task 7: implemented 74eb5c5 (base 50ea23e). Migration 0009_material.sql (0007 and 0008 reserved for Tasks 9 and 11). RLS not run, keys still missing.
Task 7: review Needs fixes: direct UPDATE/DELETE policies on items/topics/lessons bypass change_log; vacuous stranger-restore assertion; swallowed read errors show studied items as new.
Task 7: Ruling: no-op update_item logging and the 200-row merge lookup promoted into the fix round — cheap, and both show wrong history to the user — cost: none.
Task 7: minor (deferred): email fallback in material_actor is dead (trigger uses display_name only, so nameless users show "someone"); not-found raised before authorization leaks uuid existence; publish_resolve_topic does not lock against a concurrent merge; saveNoteForm says Saved when no row matched; RLS coverage gaps (ended link, cross-student topicId in update_item, another student's change id in undo_merge, topic change id in restore_item).
Task 7: fix round 1/5 (5 addressed, 0 open; commit f65d7a7). Scoped re-review by controller: no app code writes items/topics/lessons as a user; policies now select-only, writes revoked from authenticated and anon.
Task 7: Ruling: carried to Task 12 — the planner import cannot insert items, topics or lessons as the user any more; it must write through the service role or a definer RPC that also writes change_log — cost if missed: import fails with permission denied.
Task 7: complete pending RLS (commits 50ea23e..f65d7a7). Gate: npm run test:rls must pass for 0006 and 0009 before Task 8.
Tasks 6 and 7: RLS gate passed 2026-10-29 after Capri restored .env.test.local: migrations 0001-0006 and 0009 applied, npm run test:rls 8 files, 79/79 pass.
Task 6: complete (commits 90237eb..83a8df4, review approved, RLS 79/79)
Task 7: complete (commits 50ea23e..f65d7a7, review approved after fix round 1, RLS 79/79)
Task 8: implemented be44744 (base ea30d41). 0010_sessions.sql closes direct writes to sessions and session_results (0002 let students set counted and duration_s); writes go through start_session, record_result, finish_session.
Task 8: review Needs fixes: voice counted taken from the client and idle-closed spoken sessions never count; duration_s includes idle time.
Task 8: Ruling: server-set sessions.spoke_at via mark_spoke replaces the client spokeOnce flag; Task 9's voice turn must call the 'spoke' action on the first spoken turn — cost if missed: voice sessions never count.
Task 8: Ruling: a session ends at last activity once idle 10 minutes, in both finish and the cron path, and results into such a session are refused so the client starts a fresh one — matches the spec's 10 idle minutes — cost: a student returning after 10 minutes gets a new session.
Task 8: Ruling: flashcard error recovery splitting sessions and the unfiltered session_results read promoted into the fix round — the tutor would see fragmented sessions — cost: small.
Task 8: minor (deferred): closeIdleSessions read-then-update is not atomic; move into a definer SQL function in Task 11.
Task 8: carried to Task 10: ItemStat has lastAnswer; keep it.
Task 8: fix round 1/5 (4 addressed, 0 open; commit 300d9d1). Scoped re-review by controller: no client spokeOnce left; spoke_at via mark_spoke; idle rule in finish_session, record_result/mark_spoke and closeIdle. Unit 98, RLS 94/94, tsc clean.
Task 8: complete (commits ea30d41..300d9d1)
2026-10-29: app Supabase project ocidfgdbjdeelbusockc created by Capri; schema applied with npm run db:migrate; preview at https://hablamos.builtbycapri.com (branch domain). It was created without Supabase's default privileges, so 0000_privileges.sql now sets them and the existing tables were repaired to match the test project. RLS 94/94 with 0000 in place.
Ruling: design pass inserted before Task 9 — no task covered visual design and Capri could not find the upload on an unstyled Add page — cost: one extra commit range to review.
Design: first pass b77e773 (voice app look on every screen, upload first on Add) committed, NOT pushed: Capri says it still reads as AI. Research in docs/research/2026-10-29-language-app-formats.md proposes a study-notebook direction; awaiting her call.
Ruling: Task 8b (profile: pronouns, greeting, photo) added 2026-10-29 at Capri's request, before Task 9; migration 0011_profile.sql (0007/0008 reserved, 0009/0010 taken).
