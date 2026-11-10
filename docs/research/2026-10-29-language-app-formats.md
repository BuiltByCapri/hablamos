# How language study tools are laid out, and what Hablamos takes from them

Research for the Hablamos redesign, 2026-10-29. The first styled pass put the voice app's colors
on every screen and still read as machine-made: every element was the same rounded card with a
thin gold border, a gradient pill button, a dashed upload box and "or" dividers. The palette was
never the problem. The layout grammar was. This looks at what real study tools and real learners
do, so the layout can come from the content.

Most sources are product documentation, reviews and learner write-ups rather than controlled
studies. Where a claim is weak it says so.

## What the research says

### 1. The vocabulary notebook is two columns, and it tests itself
The common format across Spanish teachers, learners and printed vocabulary notebooks is a split
page: the target language in one column, the translation in the other. You review by covering one
side and reading down the other. Learners who move it into a spreadsheet keep the same move,
hiding the Spanish column and recalling it. One Spanish teacher writes the phrase in Spanish,
sketches it and defines it underneath, and teaches words in sets of three inside a story.

**For Hablamos:** material is a ruled two-column list, Spanish left and English right, not a stack
of cards. Hiding a column is the built-in self-test, one tap, no separate mode needed to start.

### 2. Tutors already organize vocabulary by lesson
Preply's lesson Notes are a per-lesson record, filled in during the session: new vocabulary, error
correction, homework and next objectives. Old notes reopen by date, and tutors use them to check
what a student remembers from two weeks ago. Preply's separate flashcard tool takes words from a
topic, a collection, or added by hand during or after a lesson. italki's AI tier claims lesson
summaries, flashcards and vocabulary lists, but that is its own marketing.

**For Hablamos:** new material is grouped under the lesson it came from, headed with the date and
who taught it ("Daniel, Oct 28"), the way a notebook page is headed. That is both how tutors
already think and the strongest single thing that makes the page read as hers rather than
generated. Topics stay as the second way in.

### 3. Words in sentences, not alone
Clozemaster's whole design is a sentence with one word blanked. Its claim that cloze beats other
exercises cites an unnamed study, and a 2026 preprint on flashcard design repeats that cloze
outperforms translation recall without establishing it. Weak evidence, consistent direction.

**For Hablamos:** the example sentence shows under each word, not hidden in an editor. Later, a
flashcard can blank the word inside the tutor's own example.

### 4. Retrieval with feedback, and keep the reveal separate from the verdict
The best-supported point in this area: retrieval practice works when followed by feedback that
corrects errors. Design guidance says tapping Reveal must not count as a right answer, and that
learners over-mark half-right answers as right. RemNote recommends typing the answer for language
cards where spelling matters. Anki's four buttons confuse new users; Fluent Forever removed them.

**For Hablamos:** keep two outcomes, right or missed, asked only after the reveal. A typed-answer
option for words is worth adding later, since Spanish accents are part of being right.

### 5. Speaking corrections have a settled visual convention
A reviewer who tested five AI speaking apps found they all show mistakes the same way: the
student's words with the mistake struck through, the corrected words in bold, and a short
explanation below. Langua offers a report after a conversation that lists errors by category,
with exercises for the weak areas; that comes from Langua's own site. A rival criticises Speak's
post-conversation summary as brief and generic, which is the failure to avoid.

**For Hablamos:** this is exactly the speaking-patterns idea for Daniel. Show each pattern with one
real example, struck-through original and corrected version, not a generic summary.

### 6. Streaks: the criticism is loud, the evidence is thin
Criticism of Duolingo's streak as loss aversion and guilt is everywhere, but mostly from
commercial guides and forums, not studies. Users also report it works.

**For Hablamos:** no change. The spec already rules out streak pressure, and a tutor-fed product
has a better reason to come back: new material from the last lesson.

### 7. Effective tools look plain
A reviewer who tried many free flashcard apps found the most effective ones "almost boring":
fast, out of the way, straight back into recall. Mochi is the one praised for looking clean and
elegant; Anki's interface is the standard example of a bad one. CapWords, the 2025 Apple Design
Award language app, won on delight: photos turned into word stickers and real sounds on each card.

**For Hablamos:** restraint. Typography and rules carry the page; color is used for meaning.

## The direction this gives

A study notebook, not an app dashboard.

- **Lists are ruled lines in two columns**, Spanish in Fraunces on the left, English in Inter on
  the right, example sentence small underneath. No boxes around items.
- **Pages are headed like notebook pages**: the lesson date and the tutor's name, so the home page
  reads as a record of real lessons.
- **Gold means one thing**: the date line and counts, the way a ruled notebook has one colored
  margin. Not every heading and border.
- **Buttons are plain and flat**, one primary action per screen, no gradients.
- **Upload is a ruled writing area** you paste into or attach a photo to, not a dashed drop zone.
- **Corrections use the convention learners already know**: struck-through original, bold fix,
  one line of why.

## Sources
- [Spanish Mama, Spanish Notebook Section 4: Vocabulary](https://spanishmama.com/section-4-vocabulary/)
- [SpanishDict answers: use Excel for vocabulary practice](https://www.spanishdict.com/answers/179055/tip-use-excel-for-vocubulary-practice)
- [German Vocabulary Notebook, split-page layout (AbeBooks)](https://www.abebooks.com/German-Vocabulary-Notebook-Split-page-layout/32394257812/bd)
- [Teach Starter, bilingual vocabulary notebook template](https://teachstarter.com/us/teaching-resource/bilingual-vocabulary-notebook-template)
- [Preply Classroom features for tutors](https://help.preply.com/en/articles/4182374-preply-classroom-features-for-tutors-a-complete-guide)
- [Preply vocabulary flashcard tool](https://help.preply.com/en/articles/5962669-vocabulary-flashcard-tool)
- [italki Plus](https://www.italki.com/en/blog/italki-plus)
- [Clozemaster: cloze testing and spaced repetition](https://www.clozemaster.com/blog/how-clozemaster-is-using-cloze-testing-and-spaced-repetition-to-make-language-learning-faster-and-more-effective)
- [Alex Strick van Linschoten, ClozeMaster: learn words in context](https://www.alexstrick.com/blog/clozemaster)
- [Memdora: cognitively grounded flashcard interactions (arXiv preprint)](https://arxiv.org/pdf/2607.25096)
- [Flashcard answer reveal and self-grading UX](https://screensdesign.com/articles/flashcard-answer-reveal-self-grading-ux/)
- [RemNote: typing in answers](https://help.remnote.com/en/articles/7752298-typing-in-answers)
- [Fluent Forever: why no Easy/Normal/Hard](https://help.fluent-forever.com/hc/en-us/articles/360004952371-Why-can-t-I-say-whether-a-flashcard-was-Easy-Normal-Hard-like-I-can-in-Anki)
- [Why your flashcard app shows words you already know (DEV)](https://dev.to/_funlingo_/why-your-flashcard-app-is-showing-you-words-you-already-know-and-what-to-do-about-it-1oj3)
- [First impressions of Mochi](https://borretti.me/article/first-impressions-mochi)
- [I tried every free flashcard app (GeekChamp)](https://geekchamp.com/?p=237401)
- [Lingtuitive: I tested the top 5 AI speaking apps](https://lingtuitive.com/blog/best-ai-speaking-apps)
- [Langua](https://languatalk.com/try-langua)
- [Lingrow: Speak app alternatives](https://lingrow.io/blog/speak-app-alternatives)
- [The Independent via Gulf Today: the language app you can't put down](https://gulftoday.ae/Opinion/2023/11/06/The-language-app-you-just-cant-put-down)
- [ScreenWise: Duolingo streaks and anxiety](https://screenwiseapp.com/guides/duolingo-streaks-and-anxiety-in-kids)
- [Apple Design Awards 2025 winners and finalists](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/)
- [UX Planet: LingQ usability](https://uxplanet.org/lingq-language-learning-app-usability-3e6f08f3fc50)
- [Comparative analysis of mobile language learning apps (Lublin, 2025)](https://ph.pollub.pl/index.php/jcsi/article/view/7909)
