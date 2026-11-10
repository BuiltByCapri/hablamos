import Link from "next/link";
import { getAdminClient } from "../../../lib/supabase/admin";
import { getAppUrl, getServerClient, requireUser } from "../../../lib/supabase/server";
import { previewInviteWith } from "../../../lib/links";
import { acceptInviteForm, signOut } from "../../actions";
import { Flash } from "../../../components/Flash";

type Params = Promise<{ token: string }>;
type Search = Promise<{ error?: string }>;

export default async function InvitePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { token } = await params;
  const { error } = await searchParams;
  const { user } = await requireUser(`/invite/${encodeURIComponent(token)}`);
  const preview = await previewInviteWith(
    { db: getServerClient(), admin: getAdminClient(), appUrl: await getAppUrl() },
    token,
  );

  return (
    <main className="page">
      <header className="intro">
        <p className="brand">Hablamos</p>
        <h1 className="title">Tutor invite</h1>
      </header>
      <Flash error={error} />
      {preview.ok ? (
        <>
          <section className="sheet letter">
            <p className="from">From {preview.tutorName}</p>
            <p>
              <strong>{preview.tutorName}</strong> wants to be your tutor. They'll be able to add lesson material for you and
              see your study sessions and progress. Your private notes stay private, and you can unlink at any time.
            </p>
            <p className="sign">{preview.tutorName}</p>
          </section>
          <form action={acceptInviteForm.bind(null, token)}>
            <button type="submit" className="primary wide">
              Accept
            </button>
          </form>
        </>
      ) : (
        <section className="sheet letter flat">
          <p>{preview.reason}</p>
          <p className="note">You're signed in as {user.email}.</p>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </section>
      )}
      <Link href="/" className="back">
        Letters
      </Link>
    </main>
  );
}
