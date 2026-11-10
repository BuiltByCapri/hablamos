import Link from "next/link";
import { requireUser } from "../../lib/supabase/server";
import { AppFoot, AppNav } from "../../components/AppNav";

// How the app works, written as a letter like everything else here. Linked
// from the foot of every page and from Letters while there is little in it.
export default async function HowPage() {
  const { profile } = await requireUser("/how");
  const name = profile.display_name?.trim() || null;

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <article className="sheet letter how">
        <p className="from">From Hablamos · How it works</p>
        <p className="dear">{name ? `Hola ${name},` : "Hola,"}</p>
        <p>Here's how this works. Everything you study comes from your own lessons.</p>

        <h2>Letters</h2>
        <p>
          When your tutor sends a lesson, it arrives on <Link href="/">Letters</Link>: dated, signed, with the new words,
          phrases and grammar inside. The newest lesson is open at the top. Earlier ones are listed underneath.
        </p>

        <h2>Add</h2>
        <p>
          To add your own, tap <Link href="/add">Add</Link>. Paste your notes, or attach a photo of the board, a PDF or a
          Word file, and press Read my material. Hablamos picks out the words, phrases and grammar. You check them, fix
          anything, then add them. To add a single word, open Add one word by hand on the same page.
        </p>

        <h2>Practice</h2>
        <p>
          Tap <Link href="/flashcards">Practice</Link>. Each word and phrase is an index card. Tap it to turn it over, then say
          whether you knew it. Anything you miss is gathered under To revisit, so you can practice just those.
        </p>
        <p>
          Or choose <Link href="/quiz">Quiz</Link> at the top of Practice. Pick what it covers, a letter, a topic, what you keep
          missing, nationalities or present tense verbs, and how long. The quiz checks your answers, accents
          included, and anything you miss comes back under To revisit.
        </p>

        <h2>Grammar &amp; reference</h2>
        <p>
          <Link href="/reference">Grammar &amp; reference</Link> has the verb conjugator, subject pronouns, the regular endings, ser
          and estar, countries and nationalities, numbers and the alphabet. Tap any Spanish word to hear it.
        </p>

        <h2>Notes</h2>
        <p>
          <Link href="/notes">Notes</Link> are yours alone. Your tutor never sees them.
        </p>

        <h2>What your tutor sees</h2>
        <p>
          Which days you studied and for how long, which words you know and which you keep missing. Never your notes.
        </p>

        <p className="sign">Hablamos</p>
      </article>
      <AppFoot />
    </main>
  );
}
