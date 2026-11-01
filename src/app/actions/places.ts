"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { createLocation, deleteLocation, moveLocation, renameLocation } from "@/domain/locations";
import { run } from "@/server/action";
import { requireUser } from "@/server/auth";

const touched = () => {
  revalidatePath("/places");
  revalidatePath("/library");
};

export async function createPlaceAction(name: string, parentId: string | null) {
  const user = await requireUser();
  return run(async () => {
    const loc = await createLocation(db, user.id, { name, parentId });
    touched();
    return loc.id;
  });
}

export async function renamePlaceAction(id: string, name: string) {
  const user = await requireUser();
  return run(async () => {
    await renameLocation(db, user.id, id, name);
    touched();
  });
}

export async function movePlaceAction(id: string, parentId: string | null) {
  const user = await requireUser();
  return run(async () => {
    await moveLocation(db, user.id, id, parentId);
    touched();
  });
}

export async function deletePlaceAction(id: string) {
  const user = await requireUser();
  return run(async () => {
    const res = await deleteLocation(db, user.id, id);
    touched();
    return res;
  });
}
