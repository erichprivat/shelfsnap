"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invalid } from "@/domain/errors";
import {
  commitSnap,
  confirmAllMatched,
  confirmSpine,
  createSnapSession,
  getOwnedSession,
  processSnap,
  rejectSpine,
  validateSnapUpload,
} from "@/domain/snap";
import { run } from "@/server/action";
import { requireUser } from "@/server/auth";
import { catalogueSource, readUpload, saveUpload, spineReader } from "@/server/services";
import { prepareImage } from "@/sources/spine-reader";

export async function createSnapAction(_: unknown, form: FormData) {
  const user = await requireUser();
  const result = await run(async () => {
    const file = form.get("photo");
    if (!(file instanceof File)) throw invalid("Choose a photo of your shelf");
    validateSnapUpload(file);
    const locationId = (form.get("locationId") as string) || null;
    // Normalise once on upload: fixes rotation and makes HEIC viewable in every browser.
    const { data } = await prepareImage(new Uint8Array(await file.arrayBuffer())).catch(() => {
      throw invalid("We couldn't open that image. Try a JPEG or PNG.");
    });
    const imagePath = await saveUpload(user.id, data, "jpg");
    const session = await createSnapSession(db, user.id, { imagePath, locationId });
    await processSnap(db, spineReader, catalogueSource, user.id, session.id, data);
    return session.id;
  });
  if (!result.ok) return result;
  redirect(`/snap/${result.data}`);
}

export async function retrySnapAction(sessionId: string) {
  const user = await requireUser();
  return run(async () => {
    const session = await getOwnedSession(db, user.id, sessionId);
    await processSnap(db, spineReader, catalogueSource, user.id, sessionId, await readUpload(session.imagePath));
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
    const res = await commitSnap(db, user.id, sessionId);
    revalidatePath(`/snap/${sessionId}`);
    revalidatePath("/library");
    return res;
  });
}
