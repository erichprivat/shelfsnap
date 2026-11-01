import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbLike } from "@/db";
import { copies, locations } from "@/db/schema";
import { conflict, invalid, notFound } from "./errors";
import { normalizeText } from "./text";

export const MAX_LOCATION_DEPTH = 4;
const MAX_NAME = 60;

type Location = typeof locations.$inferSelect;

function validName(raw: string) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw invalid("Give the location a name");
  if (name.length > MAX_NAME) throw invalid(`Keep location names under ${MAX_NAME} characters`);
  return name;
}

export async function getOwnedLocation(db: DbLike, userId: string, id: string): Promise<Location> {
  const loc = await db.query.locations.findFirst({ where: and(eq(locations.id, id), eq(locations.userId, userId)) });
  if (!loc) throw notFound("Location");
  return loc;
}

async function allLocations(db: DbLike, userId: string) {
  return db.query.locations.findMany({
    where: eq(locations.userId, userId),
    orderBy: [asc(locations.sortOrder), asc(locations.name)],
  });
}

function ancestry(all: Location[], id: string | null): Location[] {
  const byId = new Map(all.map((l) => [l.id, l]));
  const chain: Location[] = [];
  const seen = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

function subtreeHeight(all: Location[], id: string): number {
  const kids = all.filter((l) => l.parentId === id);
  return kids.length === 0 ? 1 : 1 + Math.max(...kids.map((k) => subtreeHeight(all, k.id)));
}

async function assertUniqueAmongSiblings(
  db: DbLike,
  userId: string,
  parentId: string | null,
  name: string,
  exceptId?: string,
) {
  const siblings = await db.query.locations.findMany({
    where: and(eq(locations.userId, userId), parentId ? eq(locations.parentId, parentId) : isNull(locations.parentId)),
  });
  const key = normalizeText(name);
  if (siblings.some((s) => s.id !== exceptId && normalizeText(s.name) === key)) {
    throw conflict(`There's already a “${name}” here`);
  }
}

export async function createLocation(
  db: DbLike,
  userId: string,
  input: { name: string; parentId?: string | null },
): Promise<Location> {
  const name = validName(input.name);
  const parentId = input.parentId ?? null;
  if (parentId) {
    await getOwnedLocation(db, userId, parentId);
    const depth = ancestry(await allLocations(db, userId), parentId).length;
    if (depth >= MAX_LOCATION_DEPTH) throw invalid(`Locations can nest at most ${MAX_LOCATION_DEPTH} levels deep`);
  }
  await assertUniqueAmongSiblings(db, userId, parentId, name);
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${locations.sortOrder}), 0) + 1` })
    .from(locations)
    .where(and(eq(locations.userId, userId), parentId ? eq(locations.parentId, parentId) : isNull(locations.parentId)));
  const [row] = await db.insert(locations).values({ userId, parentId, name, sortOrder: next }).returning();
  return row!;
}

export async function renameLocation(db: DbLike, userId: string, id: string, rawName: string) {
  const loc = await getOwnedLocation(db, userId, id);
  const name = validName(rawName);
  if (name === loc.name) return loc;
  await assertUniqueAmongSiblings(db, userId, loc.parentId, name, id);
  const [row] = await db.update(locations).set({ name }).where(eq(locations.id, id)).returning();
  return row!;
}

export async function moveLocation(db: DbLike, userId: string, id: string, newParentId: string | null) {
  const loc = await getOwnedLocation(db, userId, id);
  if (newParentId === loc.parentId) return loc;
  const all = await allLocations(db, userId);
  if (newParentId) {
    await getOwnedLocation(db, userId, newParentId);
    if (newParentId === id || ancestry(all, newParentId).some((a) => a.id === id)) {
      throw invalid("A location can't be moved inside itself");
    }
    if (ancestry(all, newParentId).length + subtreeHeight(all, id) > MAX_LOCATION_DEPTH) {
      throw invalid(`Locations can nest at most ${MAX_LOCATION_DEPTH} levels deep`);
    }
  }
  await assertUniqueAmongSiblings(db, userId, newParentId, loc.name, id);
  const [row] = await db.update(locations).set({ parentId: newParentId }).where(eq(locations.id, id)).returning();
  return row!;
}

/**
 * Removes a location without losing anything inside it: its books and
 * sub-locations move up to the parent (or become unplaced at the top level).
 * Books keep their order, placed after whatever already sits in the parent.
 */
export async function deleteLocation(db: DbLike, userId: string, id: string) {
  const loc = await getOwnedLocation(db, userId, id);
  const all = await allLocations(db, userId);
  const children = all.filter((l) => l.parentId === id);
  const parentSiblings = all.filter((l) => l.parentId === loc.parentId && l.id !== id);
  for (const child of children) {
    if (parentSiblings.some((s) => normalizeText(s.name) === normalizeText(child.name))) {
      throw conflict(`Can't remove “${loc.name}”: its “${child.name}” would clash with one already above it. Rename one first.`);
    }
  }

  const [{ maxPos } = { maxPos: 0 }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${copies.position}), 0)` })
    .from(copies)
    .where(and(eq(copies.userId, userId), loc.parentId ? eq(copies.locationId, loc.parentId) : isNull(copies.locationId)));
  const moving = await db.query.copies.findMany({
    where: eq(copies.locationId, id),
    orderBy: [asc(copies.position)],
  });
  for (const [i, c] of moving.entries()) {
    await db
      .update(copies)
      .set({ locationId: loc.parentId, position: maxPos + i + 1 })
      .where(eq(copies.id, c.id));
  }
  if (children.length) {
    await db
      .update(locations)
      .set({ parentId: loc.parentId })
      .where(inArray(locations.id, children.map((c) => c.id)));
  }
  await db.delete(locations).where(eq(locations.id, id));
  return { movedCopies: moving.length, movedLocations: children.length };
}

export type LocationNode = Location & { copyCount: number; children: LocationNode[] };

export async function locationTree(db: DbLike, userId: string): Promise<LocationNode[]> {
  const all = await allLocations(db, userId);
  const counts = await db
    .select({ locationId: copies.locationId, n: sql<number>`count(*)` })
    .from(copies)
    .where(eq(copies.userId, userId))
    .groupBy(copies.locationId);
  const countOf = new Map(counts.map((c) => [c.locationId, Number(c.n)]));
  const build = (parentId: string | null): LocationNode[] =>
    all
      .filter((l) => l.parentId === parentId)
      .map((l) => ({ ...l, copyCount: countOf.get(l.id) ?? 0, children: build(l.id) }));
  return build(null);
}

export async function locationPath(db: DbLike, userId: string, id: string): Promise<Location[]> {
  return ancestry(await allLocations(db, userId), id);
}
