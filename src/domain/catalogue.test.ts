import { beforeEach, describe, expect, it } from "vitest";
import { editions, works } from "@/db/schema";
import { book, testDb, type TestDb } from "@/test/db";
import { resolveIsbn, searchLocal, upsertBook, type CatalogueSource } from "./catalogue";
import { DomainError } from "./errors";

let db: TestDb;
beforeEach(async () => {
  db = await testDb();
});

describe("upsertBook", () => {
  it("dedupes editions by ISBN, whichever form it arrives in", async () => {
    const a = await upsertBook(db, book("The Hobbit", "J.R.R. Tolkien", "0261102214"));
    const b = await upsertBook(db, book("Hobbit", "Tolkien", "978-0-261-10221-7"));
    expect(b).toEqual(a);
    expect(await db.$count(editions)).toBe(1);
  });

  it("puts two ISBNs of the same book under one work", async () => {
    const a = await upsertBook(db, book("Dune", "Frank Herbert", "9780441172719"));
    const b = await upsertBook(db, book("Dune (Dune Chronicles, #1)", "Frank Herbert", "9780340960196"));
    expect(b.workId).toBe(a.workId);
    expect(b.editionId).not.toBe(a.editionId);
  });

  it("keeps same-titled books by different authors apart", async () => {
    const a = await upsertBook(db, book("Collected Poems", "Sylvia Plath"));
    const b = await upsertBook(db, book("Collected Poems", "Philip Larkin"));
    expect(a.workId).not.toBe(b.workId);
  });

  it("reuses one placeholder edition per binding for books without an ISBN", async () => {
    const a = await upsertBook(db, book("Sult", "Knut Hamsun"));
    const b = await upsertBook(db, book("Sult", "Knut Hamsun"));
    const c = await upsertBook(db, { ...book("Sult", "Knut Hamsun"), edition: { binding: "hardcover" } });
    expect(b.editionId).toBe(a.editionId);
    expect(c.editionId).not.toBe(a.editionId);
    expect(c.workId).toBe(a.workId);
  });

  it("strips series suffixes from stored titles and dedupes authors", async () => {
    const { workId } = await upsertBook(db, { title: "  Dune  (Dune Chronicles, #1)", authors: ["Frank Herbert", "frank herbert", " "] });
    const w = await db.query.works.findFirst({ where: (t, { eq }) => eq(t.id, workId) });
    expect(w?.title).toBe("Dune");
    expect(w?.authors).toEqual(["Frank Herbert"]);
  });

  it("rejects a book without a title", async () => {
    await expect(upsertBook(db, { title: "   ", authors: ["X"] })).rejects.toThrow(DomainError);
  });

  it("fills gaps on an existing edition but never overwrites known data", async () => {
    await upsertBook(db, { ...book("Stoner", "John Williams", "9781590171998"), edition: { isbn13: "9781590171998" as never, pageCount: 288 } });
    await upsertBook(db, {
      ...book("Stoner", "John Williams"),
      edition: { isbn13: "9781590171998" as never, pageCount: 999, coverUrl: "https://example.com/c.jpg", publisher: "NYRB" },
    });
    const e = await db.query.editions.findFirst();
    expect(e?.pageCount).toBe(288);
    expect(e?.coverUrl).toBe("https://example.com/c.jpg");
    expect(e?.publisher).toBe("NYRB");
  });

  it("drops implausible years and page counts", async () => {
    const { editionId, workId } = await upsertBook(db, {
      title: "Odd Data",
      authors: ["A"],
      firstPublishYear: 99999,
      edition: { publishYear: -4, pageCount: 0 },
    });
    const e = await db.query.editions.findFirst({ where: (t, { eq }) => eq(t.id, editionId) });
    const w = await db.query.works.findFirst({ where: (t, { eq }) => eq(t.id, workId) });
    expect(e?.publishYear).toBeNull();
    expect(e?.pageCount).toBeNull();
    expect(w?.firstPublishYear).toBeNull();
  });

  it("attaches an Open Library key to a work first seen without one", async () => {
    const a = await upsertBook(db, book("Piranesi", "Susanna Clarke"));
    const b = await upsertBook(db, { ...book("Piranesi", "Susanna Clarke"), openLibraryKey: "/works/OL1W" });
    expect(b.workId).toBe(a.workId);
    expect((await db.query.works.findFirst())?.openLibraryKey).toBe("/works/OL1W");
    expect(await db.$count(works)).toBe(1);
  });
});

it("merges Open Library's duplicate work records for the same book", async () => {
  const a = await upsertBook(db, { ...book("Stoner", "John Williams"), openLibraryKey: "/works/OL1W" });
  const b = await upsertBook(db, { ...book("Stoner", "John Williams"), openLibraryKey: "/works/OL2W" });
  expect(b.workId).toBe(a.workId);
  expect((await db.query.works.findFirst())?.openLibraryKey).toBe("/works/OL1W");
});

describe("resolveIsbn", () => {
  const source = (impl: Partial<CatalogueSource>): CatalogueSource => ({
    lookupIsbn: async () => null,
    search: async () => [],
    searchByTitle: async () => [],
    ...impl,
  });

  it("rejects an invalid ISBN without calling the source", async () => {
    let called = false;
    const s = source({ lookupIsbn: async () => ((called = true), null) });
    await expect(resolveIsbn(db, s, "123")).rejects.toMatchObject({ code: "invalid_input" });
    expect(called).toBe(false);
  });

  it("serves from the local catalogue first", async () => {
    const local = await upsertBook(db, book("Stoner", "John Williams", "9781590171998"));
    const s = source({ lookupIsbn: async () => { throw new Error("should not be called"); } });
    expect(await resolveIsbn(db, s, "1590171993")).toEqual(local);
  });

  it("caches what the source returns", async () => {
    const s = source({ lookupIsbn: async () => book("Stoner", "John Williams") });
    const first = await resolveIsbn(db, s, "9781590171998");
    const second = await resolveIsbn(db, source({}), "9781590171998");
    expect(second).toEqual(first);
  });

  it("reports not found and upstream outages distinctly", async () => {
    await expect(resolveIsbn(db, source({}), "9781590171998")).rejects.toMatchObject({ code: "not_found" });
    const down = source({ lookupIsbn: async () => { throw new Error("ECONNRESET"); } });
    await expect(resolveIsbn(db, down, "9781590171998")).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
});

describe("searchLocal", () => {
  it("finds by title or author and ignores tiny queries", async () => {
    await upsertBook(db, book("Middlemarch", "George Eliot"));
    expect((await searchLocal(db, "middle")).map((w) => w.title)).toEqual(["Middlemarch"]);
    expect((await searchLocal(db, "Eliot")).length).toBe(1);
    expect(await searchLocal(db, "m")).toEqual([]);
  });
  it("treats SQL wildcards as plain text", async () => {
    await upsertBook(db, book("Middlemarch", "George Eliot"));
    expect(await searchLocal(db, "%%")).toEqual([]);
  });
});
