import { and, eq, exists, isNull, lt, or } from "drizzle-orm";
import type { DbLike as Db } from "@/db";
import { copies, editions, readingStatus, works } from "@/db/schema";
import type { VolumeDetails, VolumeQuery } from "@/sources/googlebooks";
import type { WorkDetails } from "@/sources/openlibrary";
import { fillEditionGaps, type BookRecord, type EditionRecord } from "./catalogue";
import { isSameBook } from "./text";

export type EnrichSources = {
  openLibrary?: {
    workDetails(workKey: string): Promise<WorkDetails | null>;
    editionDetails(editionKey: string): Promise<EditionRecord | null>;
    searchByTitle(title: string, author: string | null, limit: number): Promise<BookRecord[]>;
  };
  googleBooks?: { lookup(query: VolumeQuery): Promise<VolumeDetails | null> };
};

/** Works whose details came up empty are looked up again after this long; catalogues keep growing. */
export const RETRY_EMPTY_MS = 30 * 24 * 3_600_000;
/** Edition records fetched per work; a work rarely has more editions anyone owns. */
const MAX_EDITION_LOOKUPS = 3;

type Edition = typeof editions.$inferSelect;


/**
 * Fills in what the catalogue search didn't carry: description, covers, page counts.
 * Open Library first, Google Books for whatever is still missing. Only fills gaps, never
 * overwrites, and never throws: a failed lookup leaves the book as it was.
 */
export async function enrichWork(db: Db, sources: EnrichSources, workId: string, now = new Date()): Promise<"done" | "failed"> {
  const work = await db.query.works.findFirst({ where: eq(works.id, workId), with: { editions: true } });
  if (!work) return "done";
  let failed = false;
  let keyPatch: string | null = null;
  const attempt = async <T>(label: string, fn: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      failed = true;
      console.error(`Book details lookup failed (${label}):`, e instanceof Error ? e.message : e);
      return null;
    }
  };
  const { openLibrary, googleBooks } = sources;
  let description = work.description;
  let descriptionSource = work.descriptionSource;
  const subjectsPatch: string[] = [];
  const editionPatches = new Map<string, EditionRecord>();
  const patchEdition = (e: Edition, rec: EditionRecord) => editionPatches.set(e.id, { ...editionPatches.get(e.id), ...withoutEmpty(rec) });
  const current = (e: Edition) => ({ ...e, ...editionPatches.get(e.id) });

  // Books typed in or imported have no Open Library record yet; find it by title and author.
  let workKey = work.openLibraryKey;
  if (openLibrary && !workKey) {
    const author = work.authors[0] ?? null;
    const recs = await attempt("Open Library search", () => openLibrary.searchByTitle(work.title, author, 5));
    const rec = recs?.find((r) => r.openLibraryKey && isSameBook({ title: work.title, author }, r));
    if (rec) {
      workKey = rec.openLibraryKey!;
      if (rec.edition?.coverUrl) for (const e of work.editions) if (!e.coverUrl) patchEdition(e, { coverUrl: rec.edition.coverUrl });
      // Another stored work may already hold this key (Open Library has duplicates); then just borrow its details.
      const taken = await db.query.works.findFirst({ where: eq(works.openLibraryKey, workKey), columns: { id: true } });
      if (!taken) keyPatch = workKey;
    }
  }

  if (openLibrary && workKey && (!description || work.editions.some((e) => !current(e).coverUrl))) {
    const details = await attempt("Open Library work", () => openLibrary.workDetails(workKey!));
    if (details?.description && !description) {
      description = details.description;
      descriptionSource = "openlibrary";
    }
    if (work.subjects.length === 0 && details?.subjects.length) subjectsPatch.push(...details.subjects);
    if (details?.coverUrl) for (const e of work.editions) if (!e.coverUrl) patchEdition(e, { coverUrl: details.coverUrl });
  }
  if (openLibrary) {
    const thin = work.editions.filter((e) => e.openLibraryKey && !e.pageCount).slice(0, MAX_EDITION_LOOKUPS);
    for (const e of thin) {
      const rec = await attempt("Open Library edition", () => openLibrary.editionDetails(e.openLibraryKey!));
      if (rec) patchEdition(e, { ...rec, isbn13: undefined, openLibraryKey: undefined, title: undefined });
    }
  }

  const missing = !description || work.editions.some((e) => !current(e).coverUrl || !current(e).pageCount);
  if (googleBooks && missing) {
    const withIsbn = work.editions.find((e) => e.isbn13);
    const vol = await attempt("Google Books", () =>
      googleBooks.lookup({ isbn: withIsbn?.isbn13 as VolumeQuery["isbn"], title: work.title, author: work.authors[0] ?? null }),
    );
    if (vol) {
      if (vol.description && !description) {
        description = vol.description;
        descriptionSource = "googlebooks";
      }
      for (const e of work.editions) {
        // Page count and publisher belong to one edition: only for that ISBN, or editions without one.
        const sameEdition = e.isbn13 ? e.isbn13 === vol.isbn13 : true;
        patchEdition(e, {
          coverUrl: current(e).coverUrl ? undefined : vol.coverUrl,
          ...(sameEdition ? { pageCount: vol.pageCount, publisher: vol.publisher, publishYear: vol.publishYear } : {}),
        });
      }
    }
  }

  for (const e of work.editions) {
    const patch = editionPatches.get(e.id);
    if (patch) await fillEditionGaps(db, e, patch);
  }
  const workPatch: Partial<typeof works.$inferInsert> = {
    // A source that failed (down, out of quota) gets asked again on the next sweep; only a clean miss waits a month.
    ...(failed ? {} : { enrichedAt: now }),
    ...(description !== work.description ? { description, descriptionSource } : {}),
    ...(subjectsPatch.length ? { subjects: subjectsPatch.slice(0, 20) } : {}),
    ...(keyPatch ? { openLibraryKey: keyPatch } : {}),
  };
  if (Object.keys(workPatch).length) await db.update(works).set(workPatch).where(eq(works.id, workId));
  return failed ? "failed" : "done";
}

const withoutEmpty = (rec: EditionRecord): EditionRecord =>
  Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== null && v !== undefined && v !== "unknown")) as EditionRecord;

/** Never looked up, or looked up a while ago without finding a description. */
export function needsEnrichment(now: Date) {
  return or(isNull(works.enrichedAt), and(isNull(works.description), lt(works.enrichedAt, new Date(now.getTime() - RETRY_EMPTY_MS))));
}

/**
 * Works someone owns or tracks that still need details, oldest first. Candidates a snap considered
 * but nobody added aren't worth the lookups; their book page enriches them if opened.
 */
export async function worksToEnrich(db: Db, limit: number, now = new Date()) {
  const owned = or(
    exists(db.select({ one: copies.id }).from(copies).innerJoin(editions, eq(copies.editionId, editions.id)).where(eq(editions.workId, works.id))),
    exists(db.select({ one: readingStatus.workId }).from(readingStatus).where(eq(readingStatus.workId, works.id))),
  );
  const rows = await db.select({ id: works.id }).from(works).where(and(needsEnrichment(now), owned)).orderBy(works.createdAt).limit(limit);
  return rows.map((r) => r.id);
}

/** Consecutive failing works after which a sweep stops: a source is down or out of quota, so the rest would fail too. */
const GIVE_UP_AFTER = 3;

/**
 * Enriches a batch one at a time, pausing between works to stay polite to the free APIs.
 * Returns how many works it looked up.
 */
export async function enrichPending(db: Db, sources: EnrichSources, opts: { limit?: number; pauseMs?: number; now?: Date } = {}) {
  const { limit = 50, pauseMs = 300, now = new Date() } = opts;
  const ids = await worksToEnrich(db, limit, now);
  let failures = 0;
  let done = 0;
  for (const id of ids) {
    if (done > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    done++;
    failures = (await enrichWork(db, sources, id, now)) === "failed" ? failures + 1 : 0;
    if (failures >= GIVE_UP_AFTER) break;
  }
  return done;
}
