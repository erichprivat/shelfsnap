import { and, asc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { DbLike } from "@/db";
import { copies, editions, type CopyFormat } from "@/db/schema";
import { conflict, invalid, notFound } from "./errors";
import { getOwnedLocation } from "./locations";
import { needsRebalance, positionBetween } from "./ordering";
import { latestAllowedDate, requireDate, todayUtc, type IsoDate } from "./dates";

type Copy = typeof copies.$inferSelect;

export async function getOwnedCopy(db: DbLike, userId: string, id: string): Promise<Copy> {
  const copy = await db.query.copies.findFirst({ where: and(eq(copies.id, id), eq(copies.userId, userId)) });
  if (!copy) throw notFound("Copy");
  return copy;
}

const inLocation = (userId: string, locationId: string | null) =>
  and(eq(copies.userId, userId), locationId ? eq(copies.locationId, locationId) : isNull(copies.locationId));

async function endPosition(db: DbLike, userId: string, locationId: string | null) {
  const [row] = await db
    .select({ p: sql<number | null>`max(${copies.position})` })
    .from(copies)
    .where(inLocation(userId, locationId));
  return row?.p ?? null;
}

export function formatForBinding(binding: (typeof editions.$inferSelect)["binding"]): CopyFormat {
  return binding === "ebook" ? "ebook" : binding === "audio" ? "audio" : "physical";
}

/** Copies the user already owns of the same edition, or of any edition of the same work. */
export async function findDuplicates(db: DbLike, userId: string, editionId: string) {
  const edition = await db.query.editions.findFirst({ where: eq(editions.id, editionId) });
  if (!edition) throw notFound("Edition");
  const owned = await db
    .select({ copy: copies, workId: editions.workId })
    .from(copies)
    .innerJoin(editions, eq(copies.editionId, editions.id))
    .where(and(eq(copies.userId, userId), eq(editions.workId, edition.workId)));
  return {
    sameEdition: owned.filter((o) => o.copy.editionId === editionId).map((o) => o.copy),
    otherEditions: owned.filter((o) => o.copy.editionId !== editionId).map((o) => o.copy),
  };
}

export type AddCopyInput = {
  editionId: string;
  format?: CopyFormat;
  locationId?: string | null;
  acquiredAt?: string | null;
  condition?: Copy["condition"];
  notes?: string | null;
  /** Set when the user has seen the duplicate warning and wants a second copy anyway. */
  allowDuplicate?: boolean;
};

export async function addCopy(db: DbLike, userId: string, input: AddCopyInput): Promise<Copy> {
  const edition = await db.query.editions.findFirst({ where: eq(editions.id, input.editionId) });
  if (!edition) throw notFound("Edition");
  const locationId = input.locationId ?? null;
  if (locationId) await getOwnedLocation(db, userId, locationId);

  const format = input.format ?? formatForBinding(edition.binding);
  if (format !== "physical" && locationId) throw invalid("Only physical books go on a shelf");

  if (!input.allowDuplicate) {
    const { sameEdition } = await findDuplicates(db, userId, input.editionId);
    if (sameEdition.some((c) => c.format === format)) {
      throw conflict("You already own this edition. Add it again to keep a second copy.");
    }
  }

  const acquiredAt = requireDate(input.acquiredAt, "Acquired date");
  if (acquiredAt && acquiredAt > latestAllowedDate()) throw invalid("Acquired date can't be in the future");

  const end = await endPosition(db, userId, locationId);
  const [row] = await db
    .insert(copies)
    .values({
      userId,
      editionId: input.editionId,
      format,
      locationId,
      position: positionBetween(end, null),
      acquiredAt,
      condition: input.condition ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  return row!;
}

/** Moves a copy to the end of another location's shelf. */
export async function moveCopy(db: DbLike, userId: string, copyId: string, locationId: string | null) {
  const copy = await getOwnedCopy(db, userId, copyId);
  if (copy.locationId === locationId) return copy;
  if (locationId) await getOwnedLocation(db, userId, locationId);
  if (copy.format !== "physical" && locationId) throw invalid("Only physical books go on a shelf");
  const end = await endPosition(db, userId, locationId);
  const [row] = await db
    .update(copies)
    .set({ locationId, position: positionBetween(end, null) })
    .where(eq(copies.id, copyId))
    .returning();
  return row!;
}

/**
 * Places a copy directly after `afterCopyId` on the same shelf (or first when null).
 * Renumbers the shelf when repeated inserts have worn the gaps too thin.
 */
export async function reorderCopy(db: DbLike, userId: string, copyId: string, afterCopyId: string | null) {
  const copy = await getOwnedCopy(db, userId, copyId);
  if (afterCopyId === copyId) return copy;

  let before: number | null = null;
  if (afterCopyId) {
    const anchor = await getOwnedCopy(db, userId, afterCopyId);
    if (anchor.locationId !== copy.locationId) throw invalid("Both books must be on the same shelf");
    before = anchor.position;
  }
  const scope = and(inLocation(userId, copy.locationId), ne(copies.id, copyId));
  const next = await db.query.copies.findFirst({
    where: before === null ? scope : and(scope, gt(copies.position, before)),
    orderBy: [asc(copies.position)],
  });
  const after = next?.position ?? null;

  if (needsRebalance(before, after)) {
    await renumberShelf(db, userId, copy.locationId);
    return reorderCopy(db, userId, copyId, afterCopyId);
  }
  const [row] = await db
    .update(copies)
    .set({ position: positionBetween(before, after) })
    .where(eq(copies.id, copyId))
    .returning();
  return row!;
}

async function renumberShelf(db: DbLike, userId: string, locationId: string | null) {
  const shelf = await db.query.copies.findMany({ where: inLocation(userId, locationId), orderBy: [asc(copies.position)] });
  for (const [i, c] of shelf.entries()) {
    await db.update(copies).set({ position: i + 1 }).where(eq(copies.id, c.id));
  }
}

export async function lendCopy(
  db: DbLike,
  userId: string,
  copyId: string,
  input: { to: string; on?: string | null; dueBack?: string | null },
  now = new Date(),
) {
  const copy = await getOwnedCopy(db, userId, copyId);
  if (copy.format !== "physical") throw invalid("Only physical copies can be lent out");
  if (copy.lentTo) throw conflict(`This copy is already with ${copy.lentTo}`);
  const to = input.to.replace(/\s+/g, " ").trim();
  if (!to) throw invalid("Who are you lending it to?");
  if (to.length > 80) throw invalid("Keep the name under 80 characters");

  const lentAt = requireDate(input.on, "Lent date") ?? todayUtc(now);
  if (lentAt > latestAllowedDate(now)) throw invalid("Lent date can't be in the future");
  const dueBackAt = requireDate(input.dueBack, "Due date");
  if (dueBackAt && dueBackAt < lentAt) throw invalid("The due date must be after the day you lent it");

  const [row] = await db
    .update(copies)
    .set({ lentTo: to, lentAt, dueBackAt })
    .where(eq(copies.id, copyId))
    .returning();
  return row!;
}

export async function returnCopy(db: DbLike, userId: string, copyId: string) {
  const copy = await getOwnedCopy(db, userId, copyId);
  if (!copy.lentTo) return copy;
  const [row] = await db
    .update(copies)
    .set({ lentTo: null, lentAt: null, dueBackAt: null })
    .where(eq(copies.id, copyId))
    .returning();
  return row!;
}

export function isOverdue(copy: Pick<Copy, "lentTo" | "dueBackAt">, today: IsoDate = todayUtc()) {
  return Boolean(copy.lentTo && copy.dueBackAt && copy.dueBackAt < today);
}

export async function updateCopyDetails(
  db: DbLike,
  userId: string,
  copyId: string,
  patch: { condition?: Copy["condition"]; notes?: string | null; acquiredAt?: string | null },
) {
  await getOwnedCopy(db, userId, copyId);
  const set: Partial<typeof copies.$inferInsert> = {};
  if (patch.condition !== undefined) set.condition = patch.condition;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.acquiredAt !== undefined) {
    const d = requireDate(patch.acquiredAt, "Acquired date");
    if (d && d > latestAllowedDate()) throw invalid("Acquired date can't be in the future");
    set.acquiredAt = d;
  }
  const [row] = await db.update(copies).set(set).where(eq(copies.id, copyId)).returning();
  return row!;
}

/** Removes the copy only; reading history for the work stays. */
export async function removeCopy(db: DbLike, userId: string, copyId: string) {
  await getOwnedCopy(db, userId, copyId);
  await db.delete(copies).where(eq(copies.id, copyId));
}
