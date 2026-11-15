import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { editions, works } from "@/db/schema";
import type { VolumeDetails } from "@/sources/googlebooks";
import type { WorkDetails } from "@/sources/openlibrary";
import { book, makeUser, testDb, type TestDb } from "@/test/db";
import { upsertBook, type BookRecord, type EditionRecord } from "./catalogue";
import { addCopy } from "./copies";
import { enrichPending, enrichWork, RETRY_EMPTY_MS, worksToEnrich, type EnrichSources } from "./enrich";
import { setStatus } from "./reading";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

const blurb = "A lighthouse keeper charts the moths of a drowned coast.";
const gBlurb = "Google's take: moths, lighthouses and a drowned coast.";

function sources(opts: { work?: WorkDetails | Error | null; edition?: EditionRecord | null; volume?: VolumeDetails | Error | null; found?: BookRecord[] } = {}) {
  const calls = { work: 0, edition: 0, volume: 0, search: 0, workKeys: [] as string[] };
  const s: EnrichSources = {
    openLibrary: {
      workDetails: async (key) => {
        calls.work++;
        calls.workKeys.push(key);
        if (opts.work instanceof Error) throw opts.work;
        return opts.work ?? null;
      },
      editionDetails: async () => {
        calls.edition++;
        return opts.edition ?? null;
      },
      searchByTitle: async () => {
        calls.search++;
        return opts.found ?? [];
      },
    },
    googleBooks: {
      lookup: async () => {
        calls.volume++;
        if (opts.volume instanceof Error) throw opts.volume;
        return opts.volume ?? null;
      },
    },
  };
  return { s, calls };
}

const volume = (v: Partial<VolumeDetails>): VolumeDetails => ({ description: null, pageCount: null, publisher: null, publishYear: null, coverUrl: null, isbn13: null, ...v });

const olBook = () => upsertBook(db, book("The Mothwing Atlas", "Ada Quill", undefined, { openLibraryKey: "/works/OL1W", edition: { openLibraryKey: "/books/OL1M", binding: "unknown" } }));
const loadWork = (id: string) => db.query.works.findFirst({ where: eq(works.id, id), with: { editions: true } });

describe("enrichWork", () => {
  it("takes the description and cover from Open Library first", async () => {
    const { workId } = await olBook();
    const { s, calls } = sources({ work: { description: blurb, coverUrl: "https://covers.example/1.jpg", subjects: ["Moths"] }, edition: { pageCount: 240, publisher: "Quayside" }, volume: volume({ description: gBlurb }) });
    await enrichWork(db, s, workId);
    const w = (await loadWork(workId))!;
    expect(w).toMatchObject({ description: blurb, descriptionSource: "openlibrary", subjects: ["Moths"] });
    expect(w.enrichedAt).toBeInstanceOf(Date);
    expect(w.editions[0]).toMatchObject({ coverUrl: "https://covers.example/1.jpg", pageCount: 240, publisher: "Quayside" });
    // Everything was found, so Google wasn't asked.
    expect(calls.volume).toBe(0);
  });

  it("finds the Open Library record of a book typed in by hand", async () => {
    const { workId } = await upsertBook(db, book("The Mothwing Atlas", "Ada Quill"));
    const found = [
      { title: "A Reader's Guide to The Mothwing Atlas", authors: ["Someone Else"], openLibraryKey: "/works/OL8W" },
      { title: "The Mothwing Atlas", authors: ["Ada Quill"], openLibraryKey: "/works/OL1W", edition: { coverUrl: "https://covers.example/s.jpg" } },
    ];
    const { s, calls } = sources({ found, work: { description: blurb, coverUrl: null, subjects: [] } });
    await enrichWork(db, s, workId);
    expect(calls.workKeys).toEqual(["/works/OL1W"]);
    const w = (await loadWork(workId))!;
    expect(w).toMatchObject({ openLibraryKey: "/works/OL1W", description: blurb, descriptionSource: "openlibrary" });
    expect(w.editions[0]!.coverUrl).toBe("https://covers.example/s.jpg");
  });

  it("borrows details without taking a key another stored work already has", async () => {
    await olBook(); // holds /works/OL1W
    // A second record of the same book that dedupe didn't catch.
    const [dup] = await db.insert(works).values({ title: "The Mothwing Atlas", authors: ["Ada Quill"], matchKey: "duplicate-record" }).returning();
    const workId = dup!.id;
    const { s } = sources({ found: [{ title: "The Mothwing Atlas", authors: ["Ada Quill"], openLibraryKey: "/works/OL1W" }], work: { description: blurb, coverUrl: null, subjects: [] } });
    await enrichWork(db, s, workId);
    expect((await loadWork(workId))!).toMatchObject({ openLibraryKey: null, description: blurb });
  });

  it("asks Google Books for what Open Library lacks", async () => {
    const { workId } = await upsertBook(db, book("Lantern Harbour", "Bo Ferren", "9781590171998"));
    const { s } = sources({ volume: volume({ description: gBlurb, coverUrl: "https://books.example/c.jpg", pageCount: 312, isbn13: "9781590171998" as never }) });
    await enrichWork(db, s, workId);
    const w = (await loadWork(workId))!;
    expect(w).toMatchObject({ description: gBlurb, descriptionSource: "googlebooks" });
    expect(w.editions[0]).toMatchObject({ coverUrl: "https://books.example/c.jpg", pageCount: 312 });
  });

  it("keeps another edition's page count off this one", async () => {
    const { workId } = await upsertBook(db, book("Lantern Harbour", "Bo Ferren", "9781590171998"));
    const { s } = sources({ volume: volume({ pageCount: 999, coverUrl: "https://books.example/c.jpg", isbn13: "9780000000002" as never }) });
    await enrichWork(db, s, workId);
    expect((await loadWork(workId))!.editions[0]).toMatchObject({ pageCount: null, coverUrl: "https://books.example/c.jpg" });
  });

  it("never overwrites what's already there", async () => {
    const { workId, editionId } = await olBook();
    await db.update(works).set({ description: "Mine.", descriptionSource: "openlibrary" }).where(eq(works.id, workId));
    await db.update(editions).set({ coverUrl: "https://mine.example/c.jpg", pageCount: 100 }).where(eq(editions.id, editionId));
    const { s } = sources({ work: { description: blurb, coverUrl: "https://covers.example/1.jpg", subjects: [] }, volume: volume({ description: gBlurb, pageCount: 5 }) });
    await enrichWork(db, s, workId);
    const w = (await loadWork(workId))!;
    expect(w.description).toBe("Mine.");
    expect(w.editions[0]).toMatchObject({ coverUrl: "https://mine.example/c.jpg", pageCount: 100 });
  });

  it("survives failing sources, keeps what it found and asks again next time", async () => {
    const { workId } = await olBook();
    const { s } = sources({ work: { description: blurb, coverUrl: null, subjects: [] }, volume: new Error("Google Books responded 429") });
    await expect(enrichWork(db, s, workId)).resolves.toBe("failed");
    const w = (await loadWork(workId))!;
    expect(w.description).toBe(blurb);
    expect(w.enrichedAt).toBeNull();
  });

  it("records a clean miss so the book isn't asked about again for a while", async () => {
    const { workId } = await olBook();
    await expect(enrichWork(db, sources().s, workId)).resolves.toBe("done");
    expect((await loadWork(workId))!.enrichedAt).toBeInstanceOf(Date);
  });
});

describe("which works get enriched", () => {
  it("picks owned and tracked books, not snap candidates nobody added", async () => {
    const owned = await upsertBook(db, book("The Mothwing Atlas", "Ada Quill"));
    const wanted = await upsertBook(db, book("Lantern Harbour", "Bo Ferren"));
    await upsertBook(db, book("Candidate Only", "Nobody"));
    await addCopy(db, me, { editionId: owned.editionId });
    await setStatus(db, me, wanted.workId, "want_to_read");
    expect((await worksToEnrich(db, 10)).sort()).toEqual([owned.workId, wanted.workId].sort());
  });

  it("retries a book without a description after a month, not before", async () => {
    const { workId, editionId } = await upsertBook(db, book("The Mothwing Atlas", "Ada Quill"));
    await addCopy(db, me, { editionId });
    const now = new Date();
    await db.update(works).set({ enrichedAt: new Date(now.getTime() - RETRY_EMPTY_MS + 60_000) }).where(eq(works.id, workId));
    expect(await worksToEnrich(db, 10, now)).toEqual([]);
    await db.update(works).set({ enrichedAt: new Date(now.getTime() - RETRY_EMPTY_MS - 60_000) }).where(eq(works.id, workId));
    expect(await worksToEnrich(db, 10, now)).toEqual([workId]);
    await db.update(works).set({ description: blurb }).where(eq(works.id, workId));
    expect(await worksToEnrich(db, 10, now)).toEqual([]);
  });

  it("works through the batch", async () => {
    for (const t of ["One Moth", "Two Moths", "Three Moths"]) {
      const { editionId } = await upsertBook(db, book(t, "Ada Quill"));
      await addCopy(db, me, { editionId });
    }
    const { s, calls } = sources({ volume: volume({ description: gBlurb }) });
    expect(await enrichPending(db, s, { pauseMs: 0 })).toBe(3);
    expect(calls.volume).toBe(3);
    expect(await enrichPending(db, s, { pauseMs: 0 })).toBe(0);
  });

  it("stops a sweep once a source keeps failing", async () => {
    for (const t of ["One Moth", "Two Moths", "Three Moths", "Four Moths", "Five Moths"]) {
      const { editionId } = await upsertBook(db, book(t, "Ada Quill"));
      await addCopy(db, me, { editionId });
    }
    const { s, calls } = sources({ volume: new Error("Google Books responded 429") });
    expect(await enrichPending(db, s, { pauseMs: 0 })).toBe(3);
    expect(calls.volume).toBe(3);
  });
});
