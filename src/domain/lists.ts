import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import type { DbLike } from "@/db";
import { listItems, lists, works } from "@/db/schema";
import { conflict, invalid, notFound } from "./errors";
import { needsRebalance, positionBetween } from "./ordering";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 1000;
export const MAX_LIST_ITEMS = 1000;

type List = typeof lists.$inferSelect;

function validName(raw: string) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw invalid("Give the list a name");
  if (name.length > MAX_NAME) throw invalid(`Keep list names under ${MAX_NAME} characters`);
  return name;
}

function validDescription(raw: string | null | undefined) {
  const d = raw?.trim() || null;
  if (d && d.length > MAX_DESCRIPTION) throw invalid("That description is too long");
  return d;
}

export async function getOwnedList(db: DbLike, userId: string, id: string): Promise<List> {
  const list = await db.query.lists.findFirst({ where: and(eq(lists.id, id), eq(lists.userId, userId)) });
  if (!list) throw notFound("List");
  return list;
}

export async function createList(db: DbLike, userId: string, input: { name: string; description?: string | null }) {
  const [row] = await db
    .insert(lists)
    .values({ userId, name: validName(input.name), description: validDescription(input.description) })
    .returning();
  return row!;
}

export async function updateList(
  db: DbLike,
  userId: string,
  id: string,
  patch: { name?: string; description?: string | null },
) {
  await getOwnedList(db, userId, id);
  const set: Partial<typeof lists.$inferInsert> = {};
  if (patch.name !== undefined) set.name = validName(patch.name);
  if (patch.description !== undefined) set.description = validDescription(patch.description);
  const [row] = await db.update(lists).set(set).where(eq(lists.id, id)).returning();
  return row!;
}

export async function deleteList(db: DbLike, userId: string, id: string) {
  await getOwnedList(db, userId, id);
  await db.delete(lists).where(eq(lists.id, id));
}

export async function addToList(db: DbLike, userId: string, listId: string, workId: string, note?: string | null) {
  await getOwnedList(db, userId, listId);
  const work = await db.query.works.findFirst({ where: eq(works.id, workId), columns: { id: true } });
  if (!work) throw notFound("Book");
  const existing = await db.query.listItems.findFirst({
    where: and(eq(listItems.listId, listId), eq(listItems.workId, workId)),
  });
  if (existing) throw conflict("That book is already on this list");
  const [stats] = await db
    .select({ n: sql<number>`count(*)`, maxPos: sql<number | null>`max(${listItems.position})` })
    .from(listItems)
    .where(eq(listItems.listId, listId));
  if (Number(stats?.n ?? 0) >= MAX_LIST_ITEMS) throw invalid(`Lists hold up to ${MAX_LIST_ITEMS} books`);
  await db.insert(listItems).values({
    listId,
    workId,
    position: positionBetween(stats?.maxPos ?? null, null),
    note: note?.trim() || null,
  });
  await db.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, listId));
}

export async function removeFromList(db: DbLike, userId: string, listId: string, workId: string) {
  await getOwnedList(db, userId, listId);
  await db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.workId, workId)));
}

export async function moveInList(db: DbLike, userId: string, listId: string, workId: string, afterWorkId: string | null) {
  await getOwnedList(db, userId, listId);
  if (afterWorkId === workId) return;
  const item = await db.query.listItems.findFirst({ where: and(eq(listItems.listId, listId), eq(listItems.workId, workId)) });
  if (!item) throw notFound("List item");
  let before: number | null = null;
  if (afterWorkId) {
    const anchor = await db.query.listItems.findFirst({
      where: and(eq(listItems.listId, listId), eq(listItems.workId, afterWorkId)),
    });
    if (!anchor) throw notFound("List item");
    before = anchor.position;
  }
  const scope = and(eq(listItems.listId, listId), ne(listItems.workId, workId));
  const next = await db.query.listItems.findFirst({
    where: before === null ? scope : and(scope, gt(listItems.position, before)),
    orderBy: [asc(listItems.position)],
  });
  const after = next?.position ?? null;
  if (needsRebalance(before, after)) {
    const all = await db.query.listItems.findMany({ where: eq(listItems.listId, listId), orderBy: [asc(listItems.position)] });
    for (const [i, it] of all.entries()) {
      await db.update(listItems).set({ position: i + 1 }).where(and(eq(listItems.listId, listId), eq(listItems.workId, it.workId)));
    }
    return moveInList(db, userId, listId, workId, afterWorkId);
  }
  await db
    .update(listItems)
    .set({ position: positionBetween(before, after) })
    .where(and(eq(listItems.listId, listId), eq(listItems.workId, workId)));
}

function newSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Buffer.from(bytes).toString("base64url");
}

/** Turns on the public link (idempotent). The slug is random so private lists can't be guessed. */
export async function shareList(db: DbLike, userId: string, listId: string) {
  const list = await getOwnedList(db, userId, listId);
  if (list.shareSlug) return list.shareSlug;
  const slug = newSlug();
  await db.update(lists).set({ shareSlug: slug }).where(eq(lists.id, listId));
  return slug;
}

export async function unshareList(db: DbLike, userId: string, listId: string) {
  await getOwnedList(db, userId, listId);
  await db.update(lists).set({ shareSlug: null }).where(eq(lists.id, listId));
}

export async function listWithItems(db: DbLike, where: { userId: string; id: string } | { slug: string }) {
  const list = await db.query.lists.findFirst({
    where: "slug" in where ? eq(lists.shareSlug, where.slug) : and(eq(lists.id, where.id), eq(lists.userId, where.userId)),
    with: {
      items: {
        orderBy: [asc(listItems.position)],
        with: { work: { with: { editions: true } } },
      },
    },
  });
  if (!list) throw notFound("List");
  return list;
}

export async function listsFor(db: DbLike, userId: string) {
  return db.query.lists.findMany({
    where: eq(lists.userId, userId),
    orderBy: [desc(lists.updatedAt)],
    with: { items: { orderBy: [asc(listItems.position)], with: { work: { with: { editions: true } } } } },
  });
}
