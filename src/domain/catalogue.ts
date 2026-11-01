import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DbLike as Db } from "@/db";
import { editions, works } from "@/db/schema";
import { DomainError } from "./errors";
import { parseIsbn, type Isbn13 } from "./isbn";
import { normalizeText, stripSeries, workMatchKey } from "./text";

export type Binding = (typeof editions.$inferSelect)["binding"];

export type EditionRecord = {
  isbn13?: Isbn13 | null;
  title?: string | null;
  publisher?: string | null;
  publishYear?: number | null;
  pageCount?: number | null;
  language?: string | null;
  binding?: Binding;
  coverUrl?: string | null;
  openLibraryKey?: string | null;
};

export type BookRecord = {
  title: string;
  subtitle?: string | null;
  authors: string[];
  firstPublishYear?: number | null;
  subjects?: string[];
  openLibraryKey?: string | null;
  edition?: EditionRecord;
};

export interface CatalogueSource {
  lookupIsbn(isbn: Isbn13): Promise<BookRecord | null>;
  search(query: string, limit: number): Promise<BookRecord[]>;
}

export type CatalogueEntry = { workId: string; editionId: string };

const clean = (s: string | null | undefined) => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

const cleanAuthors = (authors: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of authors) {
    const name = clean(a);
    if (!name) continue;
    const key = normalizeText(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
};

const plausibleYear = (y: number | null | undefined) =>
  y && Number.isInteger(y) && y > 0 && y <= new Date().getFullYear() + 2 ? y : null;
const plausiblePages = (p: number | null | undefined) => (p && Number.isInteger(p) && p > 0 && p < 20000 ? p : null);

async function findOrCreateWork(db: Db, rec: BookRecord): Promise<string> {
  const title = clean(rec.title);
  if (!title) throw new DomainError("invalid_input", "A book needs a title");
  const authors = cleanAuthors(rec.authors);
  const matchKey = workMatchKey(title, authors);

  // Open Library carries duplicate work records for many books, so a different
  // key alone doesn't make it a different book: fall back to title + author.
  const existing =
    (rec.openLibraryKey ? await db.query.works.findFirst({ where: eq(works.openLibraryKey, rec.openLibraryKey) }) : undefined) ??
    (await db.query.works.findFirst({ where: eq(works.matchKey, matchKey) }));
  if (existing) {
    const patch: Partial<typeof works.$inferInsert> = {};
    if (!existing.openLibraryKey && rec.openLibraryKey) patch.openLibraryKey = rec.openLibraryKey;
    if (!existing.firstPublishYear && plausibleYear(rec.firstPublishYear)) patch.firstPublishYear = rec.firstPublishYear;
    if (existing.subjects.length === 0 && rec.subjects?.length) patch.subjects = rec.subjects.slice(0, 20);
    if (existing.authors.length === 0 && authors.length) patch.authors = authors;
    if (Object.keys(patch).length) await db.update(works).set(patch).where(eq(works.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(works)
    .values({
      title: stripSeries(title),
      subtitle: clean(rec.subtitle),
      authors,
      firstPublishYear: plausibleYear(rec.firstPublishYear),
      subjects: (rec.subjects ?? []).slice(0, 20),
      openLibraryKey: rec.openLibraryKey ?? null,
      matchKey,
    })
    .returning({ id: works.id });
  return row!.id;
}

/**
 * Stores a book in the shared catalogue, reusing what's already there.
 * Editions are deduped by ISBN-13; a book without an ISBN gets one placeholder
 * edition per binding so copies always point at something concrete.
 */
export async function upsertBook(db: Db, rec: BookRecord): Promise<CatalogueEntry> {
  const ed = rec.edition ?? {};
  const isbn = ed.isbn13 ? parseIsbn(ed.isbn13) : null;

  if (isbn) {
    const byIsbn = await db.query.editions.findFirst({ where: eq(editions.isbn13, isbn) });
    if (byIsbn) {
      await fillEditionGaps(db, byIsbn, ed);
      return { workId: byIsbn.workId, editionId: byIsbn.id };
    }
  }
  if (ed.openLibraryKey) {
    const byKey = await db.query.editions.findFirst({ where: eq(editions.openLibraryKey, ed.openLibraryKey) });
    if (byKey) {
      await fillEditionGaps(db, byKey, { ...ed, isbn13: isbn });
      return { workId: byKey.workId, editionId: byKey.id };
    }
  }

  const workId = await findOrCreateWork(db, rec);
  const binding = ed.binding ?? "unknown";

  if (!isbn && !ed.openLibraryKey) {
    const placeholder = await db.query.editions.findFirst({
      where: and(
        eq(editions.workId, workId),
        isNull(editions.isbn13),
        isNull(editions.openLibraryKey),
        eq(editions.binding, binding),
      ),
    });
    if (placeholder) return { workId, editionId: placeholder.id };
  }

  const [row] = await db
    .insert(editions)
    .values({
      workId,
      isbn13: isbn,
      title: clean(ed.title) ?? stripSeries(clean(rec.title)!),
      publisher: clean(ed.publisher),
      publishYear: plausibleYear(ed.publishYear),
      pageCount: plausiblePages(ed.pageCount),
      language: clean(ed.language),
      binding,
      coverUrl: clean(ed.coverUrl),
      openLibraryKey: ed.openLibraryKey ?? null,
    })
    .returning({ id: editions.id });
  return { workId, editionId: row!.id };
}

async function fillEditionGaps(db: Db, existing: typeof editions.$inferSelect, ed: EditionRecord) {
  const patch: Partial<typeof editions.$inferInsert> = {};
  if (!existing.isbn13 && ed.isbn13) patch.isbn13 = ed.isbn13;
  if (!existing.coverUrl && clean(ed.coverUrl)) patch.coverUrl = clean(ed.coverUrl);
  if (!existing.pageCount && plausiblePages(ed.pageCount)) patch.pageCount = ed.pageCount;
  if (!existing.publisher && clean(ed.publisher)) patch.publisher = clean(ed.publisher);
  if (!existing.publishYear && plausibleYear(ed.publishYear)) patch.publishYear = ed.publishYear;
  if (!existing.language && clean(ed.language)) patch.language = clean(ed.language);
  if (existing.binding === "unknown" && ed.binding && ed.binding !== "unknown") patch.binding = ed.binding;
  if (Object.keys(patch).length) await db.update(editions).set(patch).where(eq(editions.id, existing.id));
}

/** Local catalogue first; falls back to the external source and caches the result. */
export async function resolveIsbn(db: Db, source: CatalogueSource, raw: string): Promise<CatalogueEntry> {
  const isbn = parseIsbn(raw);
  if (!isbn) throw new DomainError("invalid_input", "That doesn't look like a valid ISBN");
  const local = await db.query.editions.findFirst({ where: eq(editions.isbn13, isbn) });
  if (local) return { workId: local.workId, editionId: local.id };

  let rec: BookRecord | null;
  try {
    rec = await source.lookupIsbn(isbn);
  } catch {
    throw new DomainError("upstream_unavailable", "The book catalogue is unreachable right now. Try again shortly.");
  }
  if (!rec) throw new DomainError("not_found", `No book found for ISBN ${isbn}`);
  return upsertBook(db, { ...rec, edition: { ...rec.edition, isbn13: isbn } });
}

export type SearchHit = {
  workId: string | null;
  title: string;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  record: BookRecord;
};

export async function searchLocal(db: Db, query: string, limit = 10) {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return db.query.works.findMany({
    where: or(sql`${works.title} LIKE ${pattern} ESCAPE '\\'`, sql`${works.authors} LIKE ${pattern} ESCAPE '\\'`),
    with: { editions: true },
    limit,
  });
}
