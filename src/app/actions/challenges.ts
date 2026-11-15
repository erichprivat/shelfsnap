"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clearSquare,
  createChallenge,
  deleteChallenge,
  joinByCode,
  joinFeatured,
  leaveChallenge,
  placeBook,
  type NewChallenge,
} from "@/domain/challenges";
import { run } from "@/server/action";
import { requireUser } from "@/server/auth";

const touched = (id?: string) => {
  revalidatePath("/challenges");
  if (id) revalidatePath(`/challenges/${id}`);
};

export async function createChallengeAction(input: NewChallenge) {
  const user = await requireUser();
  const res = await run(async () => (await createChallenge(db, user.id, input)).id);
  if (!res.ok) return res;
  touched();
  redirect(`/challenges/${res.data}`);
}

export async function joinByCodeAction(code: string) {
  const user = await requireUser();
  const res = await run(async () => (await joinByCode(db, user.id, code)).id);
  if (!res.ok) return res;
  touched(res.data);
  redirect(`/challenges/${res.data}`);
}

export async function joinFeaturedAction(id: string) {
  const user = await requireUser();
  return run(async () => {
    await joinFeatured(db, user.id, id);
    touched(id);
  });
}

export async function leaveChallengeAction(id: string) {
  const user = await requireUser();
  const res = await run(() => leaveChallenge(db, user.id, id));
  if (!res.ok) return res;
  touched(id);
  redirect("/challenges");
}

export async function deleteChallengeAction(id: string) {
  const user = await requireUser();
  const res = await run(() => deleteChallenge(db, user.id, id));
  if (!res.ok) return res;
  touched();
  redirect("/challenges");
}

export async function placeBookAction(challengeId: string, square: number, workId: string) {
  const user = await requireUser();
  return run(async () => {
    await placeBook(db, user.id, challengeId, square, workId);
    touched(challengeId);
    revalidatePath(`/book/${workId}`);
  });
}

export async function clearSquareAction(challengeId: string, square: number) {
  const user = await requireUser();
  return run(async () => {
    await clearSquare(db, user.id, challengeId, square);
    touched(challengeId);
  });
}
