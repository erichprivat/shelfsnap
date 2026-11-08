const devLinks = globalThis as unknown as { __magicLinks?: Map<string, string> };

/** Development only: the last magic link sent to an address, so the flow works without an email provider. */
export function lastDevMagicLink(email: string): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return devLinks.__magicLinks?.get(email.toLowerCase()) ?? null;
}

export async function sendMagicLinkEmail(email: string, url: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is required to send sign-in emails");
    devLinks.__magicLinks ??= new Map();
    devLinks.__magicLinks.set(email.toLowerCase(), url);
    console.info(`[readmoth] magic link for ${email}: ${url}`);
    return;
  }
  await send(key, {
    to: email,
    subject: "Your Readmoth sign-in link",
    text: `Open this link to sign in to Readmoth. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
  });
}

/** Forwards reader feedback to FEEDBACK_TO; replying goes straight to the reader. Returns false when not configured. */
export async function sendFeedbackEmail(from: { email: string; name: string }, message: string, page: string | null) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO;
  if (!key || !to) return false;
  await send(key, {
    to,
    replyTo: from.email,
    subject: `Readmoth feedback from ${from.name || from.email}`,
    text: `${message}\n\n— ${from.email}${page ? `, on ${page}` : ""}`,
  });
  return true;
}

async function send(key: string, mail: { to: string; subject: string; text: string; replyTo?: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Readmoth <hello@readmoth.app>",
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
}
