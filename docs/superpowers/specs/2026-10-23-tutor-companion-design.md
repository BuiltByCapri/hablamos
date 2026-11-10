# Hablamos tutor companion: design

## Intent

A study companion a tutor gives their student for the days between lessons. Today, words and
grammar from a lesson only reach a study tool if the student types them in, and that happens
sometimes. Progress in the current planner is assumed: its streak counts ticked checklists, not
study. This version fixes both. The tutor uploads what they already have from a lesson, the tool
sorts it into the student's study material, and progress is recorded only when the student
actually studies.

**Hablamos is student-centred, lesson-fed and tutor-supported.** The student's learning history
persists independently of any particular tutor. Tutor contributions enrich that history rather
than own it: what a tutor publishes belongs to the student, survives unlinking, and survives the
tutor deleting their own account, with the tutor still named as its source where they can be.

The first users are Capri (student) and her Spanish tutor. It is built so it can be sold to tutors
later, possibly as bonus material tutors include with their own lessons.

## What exists now

- **Hablamos voice app** (this repo, live at hablamos-roan.vercel.app). `index.html` is the whole
  app: browser speech recognition, speech synthesis, a topic picker, a "words to practice" box the
  learner pastes into. `api/chat.js` is a Vercel function that calls Claude with a forced `reply`
  tool returning `reply_es`, `reply_en`, `correction`. Access is gated by a shared `APP_PASSCODE`.
  The system prompt has Capri's profile written into it ("beginner, tutor Monday and Wednesday,
  working on ser vs. estar...").
- **Hablamos planner** (repo BuiltByCapri/hablamos-plan, static page on GitHub Pages). Today
  checklist and streak, lessons calendar, dictionary lookup, vocab log in fixed categories
  (numbers, colors, animals, household, states, general), generated pronunciation respelling,
  alphabet, verb conjugator, grammar reference pages, flashcards. All data in browser storage.

Both are folded into one product in this repo. The planner's UI and categories may be
restructured entirely.

## Goals

1. A tutor can turn lesson material into the student's study material with near-zero effort:
   upload, review, publish.
2. A student can add things they learned on their own.
3. Progress reflects real study sessions, not dates or ticked boxes.
4. The tutor sees enough to plan the next lesson, and no more.
5. Multiple tutors and students are possible from day one, so selling later needs no rebuild.

## Non-goals

- Not a full platform. No scheduling, no payments between tutor and student, no video lessons,
  no messaging.
- No billing in v1. Selling is a later step; v1 only has to not block it.
- No texting reminders in v1. Email only.
- No multi-topic tagging in v1.

## Anti-goals

- The tutor's view must not be a live feed of every click.
- The student's personal notes and reflections are never shown to the tutor.
- Progress indicators must not pressure a perfect streak. Missing a day is not a failure state.
- Nothing counts as progress unless the student studied.

## People and access

- **Accounts:** every user has their own account, whether they learn independently or work with
  a tutor. Sign-in is an email link, no password, through Supabase auth. Tutor is a role an
  account can hold.
- **Tutor relationships:** a student can have zero, one, or several linked tutors. A tutor links
  to a student by inviting them by email. A tutor can have many students.
- **Ownership:** items, topics, flashcards and study records belong to the student.
  Tutor-uploaded material is also associated with the tutor who uploaded it.
- **Permissions:** linking a tutor grants access only to the agreed learning information, the
  tutor view below. Unlinking a tutor ends that tutor's access only. It removes none of the
  student's content or history, and other linked tutors keep theirs.
- **Independent learners** use everything, including uploads through the same Claude extraction
  workflow, with no tutor review step since there is no tutor.
- The shared `APP_PASSCODE` goes away; the Claude endpoint requires a signed-in user.
- No data is global except reference content (alphabet, conjugator rules).

## Language

Any language eventually, Spanish first. Target language and accent (for example Mexico or Spain)
are settings on the student, not constants in code. Prompts take the language from settings.
Reference tools that are Spanish-specific (conjugator, pronunciation respelling, alphabet) are
shown only for Spanish in v1.

## Study material

### Kinds are fixed

Every item is exactly one kind, and the kind decides how it is studied:

- **Word:** flashcards, voice practice, pronunciation.
- **Phrase:** flashcards, voice practice.
- **Grammar point:** a short explanation with examples, plus practice prompts in voice practice.
  Not a flashcard.

### Topics are flexible

- Each item has one primary topic.
- Topic and kind are independent. "Numbers" can hold word items; "forming numbers" is a grammar
  point. A topic never decides the kind.
- Claude suggests a topic per item. It must offer a match to an existing topic before proposing a
  new one.
- Tutor and student can both rename and merge topics.

### Items carry

The target-language text, the English meaning, kind, topic, an optional example sentence, who
created it, who last edited it and when, and the lesson it came from if any.

### Changes are attributable and recoverable

Every edit, removal, topic rename and topic merge records who made it, when, and what it was
before. Removed items are hidden rather than deleted. The student or a linked tutor can see an
item's history and restore an earlier version or a removed item.

- **Restoring preserves history.** Restoring an older version creates a new current version. The
  changes made after it stay in the history, so the record stays truthful.
- **Merges are traceable item by item.** Merging two topics keeps the original topic and records
  which items moved. Undoing the merge brings back the original topic and puts exactly those items
  back. Items keep their identity throughout, so study history is never duplicated or lost.

## The tutor's upload flow

1. The tutor uploads whatever they already have: pasted notes, a document, a PDF, or a photo of
   the board or a notebook.
2. Claude extracts items, assigns kind, suggests a topic (existing first), and drafts meanings
   and examples.
3. **The tutor reviews before anything reaches the student:** edit, remove, change kind, accept or
   change topic suggestions, then publish.
4. Publishing notifies the student (see reminders) and the items show as new since the last
   lesson.

## The student's own additions

The student can add a single item by hand or upload material the same way. Student additions go
straight into their material with no approval step, marked as added by the student. The tutor
can see and correct them.

## Importing from the planner

Capri's existing vocab, lessons and settings come across. Hers, 2026-10-23.

- The planner keeps everything in browser storage under the `hablamos:` prefix and has no export,
  so it gains an **Export my data** button that downloads every `hablamos:` key as one JSON file.
- The new app gains **Import from the planner** in the student's settings, which takes that file.
- **Vocab** becomes items. Each entry goes through the same extraction step as an upload, so
  Claude assigns the kind (word or phrase) and a topic, with the planner's old category passed as
  a hint and existing topics matched first. Imported items are marked as added by the student.
- **Logged lessons** become lesson records with their dates.
- **Accent and voice settings** carry over to the student's settings.
- **The streak and checklist history are not imported.** They recorded ticked boxes rather than
  study, which is the assumed progress this version exists to replace.
- Running the import twice must not create duplicates.

## Student view

- What is new, first. **New** means items from the student's most recently published lesson that
  have not been studied yet. Each item keeps its own studied status: a tutor editing the lesson
  or an item afterwards, or changing the lesson's date, never makes a studied item new again.
- Their material by topic.
- Flashcards (words and phrases) and personalised voice practice. Voice practice draws its words,
  phrases and grammar from the student's own material rather than a pasted list or fixed topics.
- Reference tools carried over from the planner: alphabet, verb conjugator, pronunciation guide,
  dictionary lookup.
- Their own session history, time spent, and words to revisit.
- Encouraging progress indicators with no pressure to keep a perfect streak.
- Private notes and reflections that only the student can see.

## Tutor view

Per student:

- Which study sessions were completed and when.
- Topics and items practised.
- Items consistently right versus frequently missed.
- A concise summary of what may need attention at the next lesson.

Not shown: per-click activity, the student's private notes.

## Progress

- With several tutors, each sees the same tutor view for that student, and each publish names the
  tutor it came from.
- A **session** and the **items practised in it** are stored separately. The session holds mode,
  start, duration and whether it qualifies. Each item practised gets its own record with an
  outcome: right or missed where that is known, otherwise "came up".
- Flashcards record right or missed per item, by the student's own answer. A flashcard run
  qualifies once one card is answered.
- A voice session qualifies once the student has spoken at least once. Qualifying says nothing
  about how each item went: voice records each item that came up, and right or missed only when
  Claude can tell from what the student said. **"Came up" is its own outcome**, never counted as
  right or missed, so uncertain results do not distort progress. Claude's reply tool gains fields for this alongside
  `reply_es`, `reply_en` and `correction`.
- "Words to revisit" are items missed recently or repeatedly.
- Opening the app without studying is not a session.

## Reminders

The student chooses one:

- a daily nudge at a time they pick,
- a nudge only after a number of quiet days they pick,
- off.

Separately, the student gets a notice when their tutor publishes new material. Email in v1.

- **Quiet hours:** 21:00 to 08:00 in the student's time zone by default, changeable by the student.
  Nothing is sent inside them: a notice or nudge that falls due then waits until they end. A daily
  nudge time the student picks inside quiet hours is honoured, since they chose it.
- **No duplicates:** at most one nudge per student per day, and one notice per publish. These
  limits are enforced by the database, not only by the hourly job, so a retried or overlapping
  check can never send twice.

## Decided by Claude, not by Capri (flagged for her review)

- One product in this repo on the existing Vercel project, rebuilt as a Next.js app, matching her
  other apps. The planner repo stays as a portfolio piece and is not deleted.
- Supabase for auth and data.
- Grammar points are not flashcards.
- Opening the app without studying does not count as a session.
- **A publish is a lesson.** Each publish creates a lesson record dated today, which the tutor can
  change, and keeps who published it. "Most recently published" goes by publish time, not the
  lesson date. There is no lessons calendar: scheduling is a non-goal.
- **Published items stay editable.** Tutors can edit or remove items after publishing, including
  student additions. Edits apply at once and go into the item's history, with the original
  creator and the last editor shown on the item.
- **A voice session ends** when the student leaves the practice screen or after 10 idle minutes.
- **Reminders run hourly** (Supabase pg_cron or an hourly job, so it does not depend on the Vercel
  plan). The student's time zone is stored and nudges go out within the hour they picked.
- **Limits:** uploads up to 10 MB, and a per-user daily cap on Claude calls, generous enough that
  normal study never hits it. Only successful calls count. Extraction results are cached by a
  fingerprint of the content plus the extraction version (prompt and model). An identical upload
  reuses the result; changed content, or a new extraction version, is processed again.
- **Deleting:** a student can delete their account and all their data.
- **The hard-coded profile becomes per-student settings:** level and current focus, editable by
  the student and any linked tutor. Each shows who last changed it and when. The voice prompt
  reads them.

## Left to the builder

- Data model and row-level security, within the rules above.
- How uploads are parsed (images and PDFs via Claude's document and vision input is fine).
- The email sender and how reminders are scheduled.
- The scoring rule behind "words to revisit" and right-versus-missed.
- How the tutor's next-lesson summary is generated.
- Visual design. The current voice app's look is a starting point, not a constraint.
