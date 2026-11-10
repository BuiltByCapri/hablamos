import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient, requireUser } from "../../../../lib/supabase/server";
import { DraftReview } from "../../../../components/DraftReview";
import { AppFoot, AppNav } from "../../../../components/AppNav";

export default async function TutorUploadPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { profile } = await requireUser(`/tutor/${studentId}/upload`);
  if (!profile.is_tutor) notFound();

  const db = getServerClient();
  // Empty unless the caller has an active link to this student.
  const { data } = await db.rpc("student_profile_for_tutor", { student: studentId });
  const student = data?.[0];
  if (!student) notFound();

  const { data: topics } = await db
    .from("topics")
    .select("id, name")
    .eq("student_id", studentId)
    .is("merged_into", null)
    .order("name");

  const name = student.display_name || "your student";
  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <Link href="/tutor" className="back">
        Students
      </Link>
      <h1 className="title">A lesson for {name}</h1>
      <p className="lede">Paste the lesson or your notes, or attach a photo. You check what it found before {name} sees it.</p>
      <DraftReview studentId={studentId} studentName={name} topics={topics ?? []} role="tutor" doneHref="/tutor" />
      <AppFoot />
    </main>
  );
}
