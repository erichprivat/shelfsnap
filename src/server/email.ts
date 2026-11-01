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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Readmoth <hello@readmoth.com>",
      to: email,
      subject: "Your Readmoth sign-in link",
      text: `Open this link to sign in to Readmoth. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
}
