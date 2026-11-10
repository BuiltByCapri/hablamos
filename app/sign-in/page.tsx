import { sendSignInLink } from "../actions";
import { Flash } from "../../components/Flash";
import { Field } from "../../components/Field";

type Search = Promise<{ next?: string; sent?: string; error?: string; notice?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: Search }) {
  const { next = "", sent, error, notice } = await searchParams;
  return (
    <main className="page">
      <header className="intro">
        <h1 className="brand">Hablamos</h1>
        <p>Your Spanish lessons, to study between them.</p>
      </header>
      <Flash notice={notice} error={error} />
      <form action={sendSignInLink}>
        <div className="sheet letter">
          <p className="from">Sign in</p>
          {sent ? (
            <p>
              We sent a sign-in link to <strong>{sent}</strong>. Open it on this device to sign in.
            </p>
          ) : (
            <p>Enter your email and we'll send you a link. No password needed.</p>
          )}
          <input type="hidden" name="next" value={next} />
          <Field label="Email">
            <input type="email" name="email" required autoComplete="email" defaultValue={sent ?? ""} />
          </Field>
        </div>
        <button type="submit" className={sent ? "btn wide" : "btn primary wide"}>
          {sent ? "Send another link" : "Send link"}
        </button>
      </form>
    </main>
  );
}
