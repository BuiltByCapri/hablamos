import { requireUser } from "../../lib/supabase/server";
import { AppFoot, AppNav } from "../../components/AppNav";
import { Conjugator } from "../../components/Conjugator";
import { Say, VoiceProvider } from "../../components/Say";
import { PRONOUNS } from "../../lib/spanish/planner-sets";
import { COUNTRIES, COUNTRY_EXAMPLES, COUNTRY_QUESTIONS, NATIONALITY_RULES } from "../../lib/spanish/countries";
import { NUMBER_PATTERNS, SER_ESTAR, SER_ESTAR_NOTE, SPANISH_ALPHABET, VERB_ENDINGS } from "../../lib/spanish/reference";

// Grammar and reference, carried over from the planner: one sheet of paper
// per subject. Every Spanish word is a tap target that says itself.

const pairs = <T,>(list: T[]): [T, T][] => list.flatMap((x, i) => (i % 2 === 0 ? [[x, list[i + 1]] as [T, T]] : []));

/** hablo as "habl" in ink and "o" in red pen. */
function Ending({ word, infinitive }: { word: string; infinitive: string }) {
  const stem = infinitive.slice(0, -2);
  const ending = word.startsWith(stem) ? word.slice(stem.length) : word;
  return (
    <Say text={word} className="ending-word">
      {word.startsWith(stem) && <span className="stem">{stem}</span>}
      <span className="end">{ending}</span>
    </Say>
  );
}

export default async function ReferencePage() {
  const { profile } = await requireUser("/reference");
  const spain = profile.accent === "es-ES";

  if (profile.language !== "es") {
    return (
      <main className="page">
        <AppNav tutor={profile.is_tutor} />
        <h1 className="title">Grammar &amp; reference</h1>
        <p className="lede">The reference pages are for Spanish for now.</p>
        <AppFoot />
      </main>
    );
  }

  return (
    <VoiceProvider accent={profile.accent} voice={profile.voice}>
      <main className="page reference">
        <AppNav tutor={profile.is_tutor} />
        <h1 className="title">Grammar &amp; reference</h1>
        <p className="lede">Tap any Spanish word to hear it.</p>
        <nav className="ref-index" aria-label="On this page">
          <a href="#verbs">Verbs</a>
          <a href="#pronouns">Pronouns</a>
          <a href="#endings">Endings</a>
          <a href="#ser-estar">Ser &amp; estar</a>
          <a href="#countries">Countries</a>
          <a href="#numbers">Numbers</a>
          <a href="#alphabet">Alphabet</a>
        </nav>

        <section className="sheet ref" id="verbs" aria-labelledby="verbs-h">
          <h2 id="verbs-h">Verb conjugator</h2>
          <p>Type a verb in its infinitive form to see it in the present tense.</p>
          <Conjugator />
        </section>

        <section className="sheet ref" id="pronouns" aria-labelledby="pronouns-h">
          <h2 id="pronouns-h">Subject pronouns</h2>
          <table className="ref-table">
            <tbody>
              {PRONOUNS.map(([es, en]) => (
                <tr key={es}>
                  <td>
                    <Say text={es} say={es.split(" / ").join(", ")} />
                  </td>
                  <td className="en">{en}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sheet ref" id="endings" aria-labelledby="endings-h">
          <h2 id="endings-h">Regular verb endings: present tense</h2>
          <p>
            The three verb families, shown with hablar (to speak), comer (to eat) and vivir (to live). Keep the stem, change the
            ending.
          </p>
          <table className="ref-table endings">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Person</span>
                </th>
                <th scope="col">-ar</th>
                <th scope="col">-er</th>
                <th scope="col">-ir</th>
              </tr>
            </thead>
            <tbody>
              {VERB_ENDINGS.map(([p, ar, er, ir]) => (
                <tr key={p}>
                  <th scope="row">{p}</th>
                  <td>
                    <Ending word={ar} infinitive="hablar" />
                  </td>
                  <td>
                    <Ending word={er} infinitive="comer" />
                  </td>
                  <td>
                    <Ending word={ir} infinitive="vivir" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sheet ref" id="ser-estar" aria-labelledby="ser-estar-h">
          <h2 id="ser-estar-h">Ser vs. estar: both mean &ldquo;to be&rdquo;</h2>
          <p>{SER_ESTAR_NOTE.ser}</p>
          <p>{SER_ESTAR_NOTE.estar}</p>
          <table className="ref-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Person</span>
                </th>
                <th scope="col">ser</th>
                <th scope="col">estar</th>
              </tr>
            </thead>
            <tbody>
              {SER_ESTAR.map(([p, ser, estar]) => (
                <tr key={p}>
                  <th scope="row">{p}</th>
                  <td>
                    <Say text={ser} />
                  </td>
                  <td>
                    <Say text={estar} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sheet ref" id="countries" aria-labelledby="countries-h">
          <h2 id="countries-h">Countries and nationalities</h2>
          <p>Where someone is from always takes ser. There are two ways to say it: ser de plus the country, or ser plus the nationality.</p>
          <ul className="ref-pairs">
            {pairs(COUNTRY_EXAMPLES).map(([a, b]) => (
              <li key={a}>
                <Say text={a} />
                <Say text={b} />
              </li>
            ))}
          </ul>
          <h3>Agreement</h3>
          <ul className="ref-rules">
            {NATIONALITY_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <h3>Asking</h3>
          <ul className="ref-chips">
            {COUNTRY_QUESTIONS.map((q) => (
              <li key={q}>
                <Say text={q} />
              </li>
            ))}
          </ul>
          <h3>Every country</h3>
          <table className="ref-table countries">
            <thead>
              <tr>
                <th scope="col">Country</th>
                <th scope="col">él</th>
                <th scope="col">ella</th>
              </tr>
            </thead>
            <tbody>
              {COUNTRIES.map((c) => (
                <tr key={c.country}>
                  <td>
                    <Say text={c.country} />
                    <span className="en">{c.english}</span>
                  </td>
                  <td>
                    <Say text={c.masculine} />
                  </td>
                  <td>
                    <Say text={c.feminine} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sheet ref" id="numbers" aria-labelledby="numbers-h">
          <h2 id="numbers-h">Number patterns</h2>
          <p>Each range of Spanish numbers is built a different way.</p>
          {NUMBER_PATTERNS.map((g) => (
            <div key={g.label} className="ref-group">
              <h3>{g.label}</h3>
              {g.note && <p className="note">{g.note}</p>}
              <ul className="ref-chips">
                {g.words.map((w) => (
                  <li key={w}>
                    <Say text={w} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="sheet ref" id="alphabet" aria-labelledby="alphabet-h">
          <h2 id="alphabet-h">The alphabet</h2>
          <p>Tap a letter to hear its name.</p>
          <ul className="alphabet">
            {SPANISH_ALPHABET.map(({ l, p, n }) => (
              <li key={l}>
                <Say text={l} say={n} className="letter-cell" />
                <span className="phon" aria-hidden="true">
                  {spain && (l === "C" || l === "Z") ? p.replace("seh", "theh") : p}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <AppFoot />
      </main>
    </VoiceProvider>
  );
}
