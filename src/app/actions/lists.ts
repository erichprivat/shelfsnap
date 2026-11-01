"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { addToList, createList, deleteList, moveInList, removeFromList, shareList, unshareList, updateList } from "@/domain/lists";
import { run } from "@/server/action";
import { requireUser } from "@/server/auth";

const touched = (id?: string) => {
  revalidatePath("/lists");
  if (id) revalidatePath(`/lists/${id}`);
};

export async function createListAction(name: string, description?: string | null) {
  const user = await requireUser();
  return run(async () => {
    const l = await createList(db, user.id, { name, description });
    touched();
    return l.id;
  });
}

export async function updateListAction(id: string, patch: { name?: string; description?: string | null }) {
  const user = await requireUser();
  return run(async () => {
    await updateList(db, user.id, id, patch);
    touched(id);
  });
}

export async function deleteListAction(id: string) {
  const user = await requireUser();
  return run(async () => {
    await deleteList(db, user.id, id);
    touched();
  });
}

export async function addToListAction(listId: string, workId: string) {
  const user = await requireUser();
  return run(async () => {
    await addToList(db, user.id, listId, workId);
    touched(listId);
    revalidatePath(`/book/${workId}`);
  });
}

export async function removeFromListAction(listId: string, workId: string) {
  const user = await requireUser();
  return run(async () => {
    await removeFromList(db, user.id, listId, workId);
    touched(listId);
    revalidatePath(`/book/${workId}`);
  });
}

export async function moveInListAction(listId: string, workId: string, afterWorkId: string | null) {
  const user = await requireUser();
  return run(async () => {
    await moveInList(db, user.id, listId, workId, afterWorkId);
    touched(listId);
  });
}

export async function shareListAction(id: string) {
  const user = await requireUser();
  return run(async () => {
    const slug = await shareList(db, user.id, id);
    touched(id);
    return slug;
  });
}

export async function unshareListAction(id: string) {
  const user = await requireUser();
  return run(async () => {
    await unshareList(db, user.id, id);
    touched(id);
  });
}
