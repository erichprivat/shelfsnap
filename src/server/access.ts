const emailList = (raw: string | undefined) => (raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Readers listed in ADMIN_EMAILS (comma-separated) can open /admin. */
export function isAdmin(email: string) {
  return emailList(process.env.ADMIN_EMAILS).includes(email.toLowerCase());
}

export const signupsAreInviteOnly = () => process.env.SIGNUPS?.trim().toLowerCase() === "invite";

/** With SIGNUPS=invite, only INVITED_EMAILS (comma-separated) and admins can create an account. Existing readers can always sign in. */
export function canSignUp(email: string) {
  if (!signupsAreInviteOnly()) return true;
  return isAdmin(email) || emailList(process.env.INVITED_EMAILS).includes(email.toLowerCase());
}
