"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invalid } from "@/domain/errors";
import {
  addMissedBook,
  correctSpine,
  type BookChoice,
  commitSnap,
  confirmAllMatched,
  confirmSpine,
  createSnapSession,
  getOwnedSession,
  PHOTO_GONE,
  processSnap,
  rejectSpine,
  validateSnapUpload,
} from "@/domain/snap";
import { assertCanSnap, assertDailyBudget, dailyBudgetFromEnv, snapLimitFromEnv } from "@/domain/usage";
import { run } from "@/server/action";
import { isAdmin, requireUser } from "@/server/auth";
import { catalogueSource, discardUploads, readUpload, saveUpload, snapsAreMetered, spineReader } from "@/server/services";
import { prepareImage } from "@/sources/spine-reader";

/** Every model read checks the reader's monthly snaps (admins have none) and the day's budget across all readers. */
async function assertCanRead(user: { id: string; email: string }) {
  if (!snapsAreMetered) return;
  if (!isAdmin(user.email)) await assertCanSnap(db, user.id, snapLimitFromEnv());
  await assertDailyBudget(db, dailyBudgetFromEnv());
}

/** Reads the photo, then deletes it if the read decided it isn't worth keeping. */
async function readSnap(userId: string, sessionId: string, imagePath: string, image: Uint8Array) {
  const session = await processSnap(db, spineReader, catalogueSource, userId, sessionId, image);
  if (session.photoDeletedAt) await discardUploads([imagePath]);
}

export async function createSnapAction(_: unknown, form: FormData) {
  const user = await requireUser();
  const result = await run(async () => {
    const file = form.get("photo");
    if (!(file instanceof File)) throw invalid("Choose a photo of your shelf");
    validateSnapUpload(file);
    await assertCanRead(user);
    const locationId = (form.get("locationId") as string) || null;
    // Normalise once on upload: fixes rotation and makes HEIC viewable in every browser.
    const { data } = await prepareImage(new Uint8Array(await file.arrayBuffer())).catch(() => {
      throw invalid("We couldn't open that image. Try a JPEG or PNG.");
    });
    const imagePath = await saveUpload(user.id, data, "jpg");
    const session = await createSnapSession(db, user.id, { imagePath, locationId });
    await readSnap(user.id, session.id, imagePath, data);
    return session.id;
  });
  if (!result.ok) return result;
  redirect(`/snap/${result.data}`);
}

export async function retrySnapAction(sessionId: string) {
  const user = await requireUser();
  return run(async () => {
    const session = await getOwnedSession(db, user.id, sessionId);
    if (session.photoDeletedAt) throw invalid(PHOTO_GONE);
    await assertCanRead(user);
    await readSnap(user.id, sessionId, session.imagePath, await readUpload(session.imagePath));
    revalidatePath(`/snap/${sessionId}`);
  });
}

export async function confirmSpineAction(sessionId: string, spineId: string, editionId?: string) {
  const user = await requireUser();
  return run(async () => {
    await confirmSpine(db, user.id, spineId, editionId);
    revalidatePath(`/snap/${sessionId}`);
  });
}

export async function rejectSpineAction(sessionId: string, spineId: string) {
  const user = await requireUser();
  return run(async () => {
    await rejectSpine(db, user.id, spineId);
    revalidatePath(`/snap/${sessionId}`);
  });
}

export async function confirmAllAction(sessionId: string) {
  const user = await requireUser();
  return run(async () => {
    const n = await confirmAllMatched(db, user.id, sessionId);
    revalidatePath(`/snap/${sessionId}`);
    return n;
  });
}

export async function commitSnapAction(sessionId: string) {
  const user = await requireUser();
  return run(async () => {
    const { added, skipped, photo } = await commitSnap(db, user.id, sessionId);
    if (photo) await discardUploads([photo]);
    revalidatePath(`/snap/${sessionId}`);
    revalidatePath("/library");
    return { added, skipped };
  });
}

export async function correctSpineAction(sessionId: string, spineId: string, choice: BookChoice) {
  const user = await requireUser();
  return run(async () => {
    await correctSpine(db, user.id, spineId, choice);
    revalidatePath(`/snap/${sessionId}`);
  });
}

export async function addMissedBookAction(sessionId: string, choice: BookChoice, afterOrdinal: number | null) {
  const user = await requireUser();
  return run(async () => {
    await addMissedBook(db, user.id, sessionId, choice, afterOrdinal);
    revalidatePath(`/snap/${sessionId}`);
  });
}
