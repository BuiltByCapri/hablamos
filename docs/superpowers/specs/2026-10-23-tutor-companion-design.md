# Hablamos tutor companion: design

## Intent

A study companion a tutor gives their student for the days between lessons. Today, words and
grammar from a lesson only reach a study tool if the student types them in, and that happens
sometimes. Progress in the current planner is assumed: its streak counts ticked checklists, not
study. This version fixes both. The tutor uploads what they already have from a lesson, the tool
sorts it into the student's study material, and progress is recorded only when the student
actually studies.

**Hablamos is student-centered, lesson-fed and tutor-supported.** The student's learning history
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

## Profile

Hers, 2026-10-29. Every account, student or tutor, has a profile page, separate from settings.

- **Name**, as others see it.
- **Pronouns**, optional and free text. A linked tutor sees the student's on the student list, and
  the student sees the tutor's.
- **How to be greeted in the target language.** For Spanish: Querida, Querido, Queride, or just the
  name. Asked directly rather than derived from pronouns, because pronouns do not map neatly onto
  grammatical gender. Until it is set, letters open "Hola {name},". It is per language, so a later
  language asks again.
- **Photo**, optional. Kept in private storage: readable only by the owner and the people linked to
  them, removed when the account is deleted.
- **Where photos appear.** The tutor's photo is the postage stamp on each of their letters, beside
  the postmark. The student's photo appears on the tutor's student list and at the top of the
  tutor's page for that student.

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
- Flashcards (words and phrases) and personalized voice practice. Voice practice draws its words,
  phrases and grammar from the student's own material rather than a pasted list or fixed topics.
- Reference tools carried over from the planner: alphabet, verb conjugator, pronunciation guide,
  dictionary lookup.
- Their own session history, time spent, and words to revisit.
- Encouraging progress indicators with no pressure to keep a perfect streak.
- Private notes and reflections that only the student can see.

## Tutor view

Per student:

- Which study sessions were completed and when.
- Topics and items practiced.
- Items consistently right versus frequently missed.
- **Patterns from speaking.** Hers, 2026-10-28, from what Daniel, her tutor, asked for. Voice
  practice already corrects the student as she speaks. Those corrections are grouped into
  recurring patterns, such as mixing up ser and estar or dropping articles, and the tutor sees
  which come up most, how often, and one recent example of what was said and the fix. This shows
  what the student struggles with when speaking, which right-versus-missed on items cannot, since
  most speaking mistakes are not tied to any one item.
- A concise summary of what may need attention at the next lesson, drawing on the speaking
  patterns as well as the items.

Not shown: per-click activity, the student's private notes.

## Progress

- With several tutors, each sees the same tutor view for that student, and each publish names the
  tutor it came from.
- A **session** and the **items practiced in it** are stored separately. The session holds mode,
  start, duration and whether it qualifies. Each item practiced gets its own record with an
  outcome: right or missed where that is known, otherwise "came up".
- Flashcards record right or missed per item, by the student's own answer. A flashcard run
  qualifies once one card is answered.
- A voice session qualifies once the student has spoken at least once. Qualifying says nothing
  about how each item went: voice records each item that came up, and right or missed only when
  Claude can tell from what the student said. **"Came up" is its own outcome**, never counted as
  right or missed, so uncertain results do not distort progress. Claude's reply tool gains fields for this alongside
  `reply_es`, `reply_en` and `correction`.
- **Speaking mistakes are recorded by pattern.** When a voice correction is a real error rather
  than a style suggestion, Claude names its pattern, reusing one of the student's existing
  patterns before naming a new one, the same way topics are matched. Each mistake keeps what the
  student said and the fix. Patterns belong to the student, like everything else.
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
  nudge time the student picks inside quiet hours is honored, since they chose it.
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
- **Speaking patterns on the tutor page:** the top five patterns from the last 30 days, each with
  its count and its most recent example. Counts, not a transcript.
- **The hard-coded profile becomes per-student settings:** level and current focus, editable by
  the student and any linked tutor. Each shows who last changed it and when. The voice prompt
  reads them.

## Left to the builder

- Data model and row-level security, within the rules above.
- How uploads are parsed (images and PDFs via Claude's document and vision input is fine).
- The email sender and how reminders are scheduled.
- The scoring rule behind "words to revisit" and right-versus-missed.
- How the tutor's next-lesson summary is generated.
- Details of the visual design within the direction below.

## Quizzes

Hers, 2026-10-29. Flashcards only test recognition, graded by the student. A quiz checks her.

- **One quiz, two uses.** Practice: a quick mixed quiz any time, score shown but not the point.
  Prepare: "am I ready for the next lesson", covering the latest letter plus what she keeps
  missing, ending in a score and a list of what to look at again.
- **Question types, mixed:** type the answer (accents count); fill the gap in the tutor's own
  example sentence; pick one of four; grammar questions built from the tutor's grammar points
  ("soy or estoy cansada?"); either direction, target language to English or back; and
  **conjugate**: a person, a verb and a tense ("nosotros + vivir, present"), checked against the
  conjugator, limited to the verbs and tenses the tutor has taught. Grammar points get practiced
  here, since they are not flashcards.
- **Agreement counts.** Where the answer changes with who is described, the question names them
  ("Ana is from Mexico: Ana es ___"), and only the agreeing form is right (mexicana, not
  mexicano).
- **She chooses** what it covers (a letter, a topic, what she keeps missing) and how long.
- **Every answer is a result** like a flashcard answer, right or missed, so misses come back and the
  tutor's view reflects them.
- Lives in Practice as Cards or Quiz, and on Today as "Quiz me on Tuesday's lesson".

## Homework

Hers, 2026-10-29. Her tutor sets homework regularly.

- **The tutor sets homework on what it is about,** not only on one letter: a letter, one or more
  topics, and skills such as verbs in a tense. Her real week, 2026-10-29: nationalities, countries
  and practicing verbs. It is a quiz built from those, a note in the tutor's own words ("write five
  sentences in the past tense"), or both, with an optional due date.
- **She can redo it as practice** as often as she likes before it is due; the tutor sees her best
  and latest attempt.
- **The student sees it on Today** ("Homework from Daniel, due Tuesday") and in the letter.
- **The tutor sees** whether it was done, and the quiz score and misses when there was a quiz.
- **Later, not v1: homework help.** A helper the student can ask while working ("why estoy here?")
  that explains and gives hints but does not hand over answers, since the tutor grades the work.

## Open: the product name

Hers, 2026-10-29. "Hablamos" fits Spanish only, from when this was a personal tool, and the product
is meant to be sold to tutors of any language, so it will be renamed before launch. No rush.

- **The shape she wants:** something like "Noted.", one word with a period. Noted itself is taken.
- **What it should name:** the product, not the interface. The letters and calls are UI; the
  product keeps what a student covered with their tutor alive between lessons. So names built on
  letters (Lettered, Penned, Sealed, Postmark, Penfriend, Inkwell) are out.
- **Raised and declined:** Between, Versed, Spoken, Covered, Kept, Retained, Prepped, Recalled.
- The name sets the domain (currently hablamos.builtbycapri.com) and the welcome line. Nothing in
  the code depends on it yet.

## Copy rule: items are not all words

A lesson holds words, phrases and grammar points. Counts name each kind ("3 words · 1 grammar
point") or use a neutral noun ("4 new", "5 things to learn"). Never "words" for a mixed set.

## Visual direction: correspondence

Hers, 2026-10-29, chosen from three mockups (lotería, correspondence, on air). The first styled
pass, the voice app's green and gold on rounded cards, read as machine-made, and she does not want
it to look like every other study app. Research is in `docs/research/2026-10-29-language-app-formats.md`.

Hablamos means "we talk", so the app is an exchange between the student and the tutor.

- **A lesson arrives as a letter.** Dated and postmarked, with the tutor's photo as the stamp,
  opening with the greeting the student chose in their profile ("Querida Capri,"), the words
  listed inside, each with its meaning and the tutor's example sentence, signed by the tutor. A P.S.
  carries what may need attention, drawn from the speaking patterns. Earlier lessons are earlier
  letters.
- **Practice is on ruled paper.** Text sits on the lines. The student's answer is in a handwritten
  blue ink.
- **Speaking practice is a phone call.** Hers, 2026-10-29: letters are the written side, a call is
  the spoken side. The practice partner has a name, one Capri will make up; the mockup uses Ana as
  a stand-in. Before the
  call: the name, the language and accent, a rotary-dial call button, and what she'll bring up
  from the latest lesson. On the call: a timer, voice lines in blue ink that move while the partner speaks (large under
  the name, small under the line being spoken), and the conversation written on ruled paper as it
  happens, partner in print, student in handwriting, with a red-pen correction inline (wrong word
  struck through, right one beside it, short margin note on why) and a small tick on lesson words
  she used. Keys at the bottom: slower, tap to talk (tap again to send, as the voice app works today), hang up.
- Type: Newsreader for text, Caveat for handwriting, IBM Plex Mono for dates and labels. Paper
  `#F6F0E3`, ink `#22201C`, blue ink `#24427A`, red pen `#A8322B`.
- The approved mockup is `docs/design/correspondence-mockup.html`; open it in a browser.
