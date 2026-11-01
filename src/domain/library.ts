import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DbLike } from "@/db";
import { copies, editions, locations, readingStatus, readThroughs, works, type CopyFormat, type ReadingStatus } from "@/db/schema";
import { normalizeText } from "./text";

export type LibraryCopy = {
  id: string;
  editionId: string;
  format: CopyFormat;
  locationId: string | null;
  position: number;
  lentTo: string | null;
  dueBackAt: string | null;
  binding: (typeof editions.$inferSelect)["binding"];
  pageCount: number | null;
  coverUrl: string | null;
  isbn13: string | null;
};

export type LibraryItem = {
  workId: string;
  title: string;
  authors: string[];
  year: number | null;
  subjects: string[];
  coverUrl: string | null;
  pageCount: number | null;
  status: ReadingStatus | null;
  copies: LibraryCopy[];
  lastFinishedAt: string | null;
  addedAt: number;
};

export type LibraryFilter = {
  q?: string;
  ownership?: "all" | "owned" | "wishlist";
  status?: ReadingStatus | "none" | "any";
  format?: CopyFormat | "any";
  locationId?: string | "unplaced" | null;
  lent?: boolean;
};

/** Everything the user owns or tracks, one item per work. Views are filters over this, not separate states. */
export async function libraryItems(db: DbLike, userId: string): Promise<LibraryItem[]> {
  const owned = await db
    .select({ copy: copies, edition: editions, work: works })
    .from(copies)
    .innerJoin(editions, eq(copies.editionId, editions.id))
    .innerJoin(works, eq(editions.workId, works.id))
    .where(eq(copies.userId, userId))
    .orderBy(asc(copies.position));
  const statuses = await db.query.readingStatus.findMany({ where: eq(readingStatus.userId, userId) });
  const finished = await db
    .select({ workId: readThroughs.workId, finishedAt: readThroughs.finishedAt })
    .from(readThroughs)
    .where(and(eq(readThroughs.userId, userId), eq(readThroughs.outcome, "finished")))
    .orderBy(desc(readThroughs.finishedAt));

  const items = new Map<string, LibraryItem>();
  const ensure = (w: typeof works.$inferSelect): LibraryItem => {
    let item = items.get(w.id);
    if (!item) {
      item = {
        workId: w.id,
        title: w.title,
        authors: w.authors,
        year: w.firstPublishYear,
        subjects: w.subjects,
        coverUrl: null,
        pageCount: null,
        status: null,
        copies: [],
        lastFinishedAt: null,
        addedAt: Number.POSITIVE_INFINITY,
      };
      items.set(w.id, item);
    }
    return item;
  };

  for (const { copy, edition, work } of owned) {
    const item = ensure(work);
    item.coverUrl ??= edition.coverUrl;
    item.pageCount ??= edition.pageCount;
    item.addedAt = Math.min(item.addedAt, copy.createdAt.getTime());
    item.copies.push({
      id: copy.id,
      editionId: edition.id,
      format: copy.format,
      locationId: copy.locationId,
      position: copy.position,
      lentTo: copy.lentTo,
      dueBackAt: copy.dueBackAt,
      binding: edition.binding,
      pageCount: edition.pageCount,
      coverUrl: edition.coverUrl,
      isbn13: edition.isbn13,
    });
  }

  const missing = statuses.filter((s) => !items.has(s.workId)).map((s) => s.workId);
  if (missing.length) {
    const tracked = await db.query.works.findMany({ where: inArray(works.id, missing), with: { editions: true } });
    for (const w of tracked) {
      const item = ensure(w);
      const ed = w.editions.find((e) => e.coverUrl) ?? w.editions[0];
      item.coverUrl = ed?.coverUrl ?? null;
      item.pageCount = ed?.pageCount ?? null;
    }
  }
  for (const s of statuses) {
    const item = items.get(s.workId);
    if (item) {
      item.status = s.status;
      if (item.copies.length === 0) item.addedAt = s.updatedAt.getTime();
    }
  }
  for (const f of finished) {
    const item = items.get(f.workId);
    if (item && f.finishedAt && !item.lastFinishedAt) item.lastFinishedAt = f.finishedAt;
  }
  const result = [...items.values()];
  for (const item of result) if (!Number.isFinite(item.addedAt)) item.addedAt = 0;
  return result;
}

export function filterLibrary(items: LibraryItem[], f: LibraryFilter): LibraryItem[] {
  const q = f.q ? normalizeText(f.q) : "";
  return items.filter((item) => {
    if (f.ownership === "owned" && item.copies.length === 0) return false;
    if (f.ownership === "wishlist" && (item.copies.length > 0 || item.status !== "want_to_read")) return false;
    if (f.status === "none" && item.status !== null) return false;
    if (f.status && f.status !== "any" && f.status !== "none" && item.status !== f.status) return false;
    if (f.format && f.format !== "any" && !item.copies.some((c) => c.format === f.format)) return false;
    if (f.locationId === "unplaced" && !item.copies.some((c) => c.format === "physical" && c.locationId === null)) return false;
    if (f.locationId && f.locationId !== "unplaced" && !item.copies.some((c) => c.locationId === f.locationId)) return false;
    if (f.lent && !item.copies.some((c) => c.lentTo)) return false;
    if (q) {
      // Word-prefix match: "read" finds "Reader" but not "Unread".
      const words = normalizeText([item.title, ...item.authors, ...item.copies.map((c) => c.isbn13 ?? "")].join(" ")).split(" ");
      if (!q.split(" ").every((t) => words.some((w) => w.startsWith(t)))) return false;
    }
    return true;
  });
}

export type LibraryStats = {
  owned: number;
  physical: number;
  digital: number;
  wishlist: number;
  reading: number;
  lent: number;
  overdue: number;
  unplaced: number;
  readThisYear: number;
};

export function libraryStats(items: LibraryItem[], today: string): LibraryStats {
  const year = today.slice(0, 4);
  const all = items.flatMap((i) => i.copies);
  return {
    owned: items.filter((i) => i.copies.length > 0).length,
    physical: all.filter((c) => c.format === "physical").length,
    digital: all.filter((c) => c.format !== "physical").length,
    wishlist: items.filter((i) => i.copies.length === 0 && i.status === "want_to_read").length,
    reading: items.filter((i) => i.status === "reading").length,
    lent: all.filter((c) => c.lentTo).length,
    overdue: all.filter((c) => c.lentTo && c.dueBackAt && c.dueBackAt < today).length,
    unplaced: all.filter((c) => c.format === "physical" && !c.locationId).length,
    readThisYear: items.filter((i) => i.lastFinishedAt?.startsWith(year)).length,
  };
}

export async function shelvesFor(db: DbLike, userId: string) {
  return db.query.locations.findMany({ where: eq(locations.userId, userId), orderBy: [asc(locations.sortOrder), asc(locations.name)] });
}
