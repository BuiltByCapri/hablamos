// Email through Resend's HTTP API. Without RESEND_API_KEY, development and
// test log a one-line notice instead of sending; production refuses, so a
// missing key never silently drops a real invite or reminder.

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set, so email cannot be sent");
    }
    console.info(`[email] RESEND_API_KEY not set, not sending "${subject}" to ${to}`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend refused the email (${res.status}): ${await res.text()}`);
  }
}
