"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { applyImport, type ImportReport } from "@/domain/import/apply";
import { MAX_IMPORT_BYTES, parseImportCsv } from "@/domain/import/parse";
import { invalid } from "@/domain/errors";
import { run } from "@/server/action";
import { auth, requireUser } from "@/server/auth";
import { headers } from "next/headers";
import { GENRES } from "@/lib/genres";

export async function sendMagicLinkAction(_: unknown, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const result = await run(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Enter a valid email address");
    await auth.api.signInMagicLink({ body: { email, callbackURL: "/library", newUserCallbackURL: "/welcome" }, headers: await headers() });
  });
  if (!result.ok) return result;
  redirect(`/sign-in/check-email?email=${encodeURIComponent(email)}`);
}

export async function saveGenresAction(genres: string[]) {
  const user = await requireUser();
  return run(async () => {
    const valid = genres.filter((g) => (GENRES as readonly string[]).includes(g)).slice(0, 12);
    await db.update(userTable).set({ favoriteGenres: valid, onboardedAt: new Date() }).where(eq(userTable.id, user.id));
    revalidatePath("/library");
  });
}

export async function importAction(_: unknown, form: FormData) {
  const user = await requireUser();
  return run(async (): Promise<ImportReport> => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw invalid("Choose your export file first");
    if (file.size > MAX_IMPORT_BYTES) throw invalid("That file is too large (15 MB max)");
    const report = await applyImport(db, user.id, parseImportCsv(await file.text()));
    revalidatePath("/library");
    return report;
  });
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
