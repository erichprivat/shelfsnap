import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { copies, readThroughs, works } from "@/db/schema";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { addCopy } from "../copies";
import { setStatus, getStatus } from "../reading";
import { applyImport } from "./apply";
import { htmlToText, parseImportCsv, parseStoryGraphDates, toHalfStars } from "./parse";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseImportCsv", () => {
  it("rejects empty, unknown and BOM-only files", () => {
    expect(() => parseImportCsv("")).toThrow(/empty/);
    expect(() => parseImportCsv("﻿  \n")).toThrow(/empty/);
    expect(() => parseImportCsv("a,b,c\n1,2,3")).toThrow(/recognise/);
  });

  it("parses a Goodreads export with all its quirks", () => {
    const { source, rows, skipped } = parseImportCsv("﻿" + fixture("goodreads.csv").replace(/\n/g, "\r\n"));
    expect(source).toBe("goodreads");
    expect(skipped).toEqual([
      { line: 6, reason: "missing title" },
      { line: 8, reason: "duplicate of an earlier row" },
    ]);
    const [dune, piranesi, wind, kindle, weird] = rows;

    expect(dune!.record.edition?.isbn13).toBe("9780441172719");
    expect(dune!.record.firstPublishYear).toBe(1965);
    expect(dune!.status).toBe("read");
    expect(dune!.rating).toBe(10);
    expect(dune!.review).toBe("Spice!\n\nLoved it & will reread.");
    expect(dune!.reads).toEqual([
      { outcome: "finished", startedAt: null, finishedAt: "2024-03-02" },
      { outcome: "finished", startedAt: null, finishedAt: null },
    ]);
    expect(dune!.ownedCopies).toBe(1);
    expect(dune!.ownedFormat).toBe("physical");

    expect(piranesi!.record.edition?.isbn13).toBeNull();
    expect(piranesi!.status).toBe("reading");
    expect(piranesi!.rating).toBeNull();
    expect(piranesi!.ownedCopies).toBe(1);

    expect(wind!.status).toBe("dnf");
    expect(wind!.reads[0]!.outcome).toBe("dnf");

    expect(kindle!.status).toBe("want_to_read");
    expect(kindle!.ownedFormat).toBe("ebook");
    expect(kindle!.ownedCopies).toBe(1);

    expect(weird!.status).toBeNull();
    expect(weird!.warnings[0]).toMatch(/Unknown shelf/);
  });

  it("parses a StoryGraph export", () => {
    const { source, rows } = parseImportCsv(fixture("storygraph.csv"));
    expect(source).toBe("storygraph");
    const [stoner, sult, middlemarch, overstory, badDates] = rows;

    expect(stoner!.rating).toBe(8);
    expect(stoner!.reads).toEqual([
      { outcome: "finished", startedAt: "2023-01-05", finishedAt: "2023-01-20" },
      { outcome: "finished", startedAt: "2024-02-01", finishedAt: "2024-02-20" },
    ]);
    expect(stoner!.ownedCopies).toBe(1);

    expect(sult!.externalId).toBe("sg-uid-123");
    expect(sult!.status).toBe("reading");
    expect(sult!.reads).toEqual([{ outcome: "in_progress", startedAt: "2024-03-01", finishedAt: null }]);

    expect(middlemarch!.status).toBe("dnf");
    expect(middlemarch!.ownedFormat).toBe("ebook");
    expect(middlemarch!.rating).toBe(3);
    expect(middlemarch!.reads).toEqual([{ outcome: "dnf", startedAt: null, finishedAt: "2024-04-01" }]);

    expect(overstory!.status).toBe("want_to_read");
    expect(overstory!.reads).toEqual([]);

    expect(badDates!.reads).toEqual([{ outcome: "finished", startedAt: null, finishedAt: "2024-03-01" }]);
  });

  it("rejects files over the row limit", () => {
    const header = "Title,Authors,Read Status\n";
    const body = Array.from({ length: 20_001 }, (_, i) => `Book ${i},A,to-read`).join("\n");
    expect(() => parseImportCsv(header + body)).toThrow(/more than/);
  });
});

it("toHalfStars rounds quarter stars and ignores zero", () => {
  expect(toHalfStars(3.75)).toBe(8);
  expect(toHalfStars(3.25)).toBe(7);
  expect(toHalfStars(0)).toBeNull();
  expect(toHalfStars(7)).toBe(10);
});

it("htmlToText keeps paragraphs and decodes entities", () => {
  expect(htmlToText("<p>One</p><p>Two &#39;quoted&#39;</p><b>x</b>")).toBe("One\n\nTwo 'quoted'x");
});

it("parseStoryGraphDates handles open and partial ranges", () => {
  expect(parseStoryGraphDates("2024/03/01-")).toEqual([{ startedAt: "2024-03-01", finishedAt: null }]);
  expect(parseStoryGraphDates("-2024/03/09")).toEqual([{ startedAt: null, finishedAt: "2024-03-09" }]);
  expect(parseStoryGraphDates("2024/03/09")).toEqual([{ startedAt: null, finishedAt: "2024-03-09" }]);
  expect(parseStoryGraphDates("")).toEqual([]);
});

describe("applyImport", () => {
  let db: TestDb;
  let me: string;
  beforeEach(async () => {
    db = await testDb();
    me = await makeUser(db);
  });

  it("imports everything and is idempotent on re-run", async () => {
    const parsed = parseImportCsv(fixture("goodreads.csv"));
    const first = await applyImport(db, me, parsed);
    expect(first).toMatchObject({ imported: 5, alreadyImported: 0, failed: [] });
    expect(first.copiesAdded).toBe(3);
    expect(first.warnings).toHaveLength(1);

    const counts = async () => ({ works: await db.$count(works), copies: await db.$count(copies), reads: await db.$count(readThroughs) });
    const before = await counts();
    const second = await applyImport(db, me, parsed);
    expect(second).toMatchObject({ imported: 0, alreadyImported: 5 });
    expect(await counts()).toEqual(before);
  });

  it("puts the rating and review on the latest read only", async () => {
    await applyImport(db, me, parseImportCsv(fixture("goodreads.csv")));
    const dune = await db.query.works.findFirst({ where: (t, { eq }) => eq(t.title, "Dune") });
    const reads = await db.query.readThroughs.findMany({ where: (t, { eq }) => eq(t.workId, dune!.id) });
    expect(reads.filter((r) => r.rating !== null)).toEqual([expect.objectContaining({ finishedAt: "2024-03-02", rating: 10 })]);
  });

  it("never overrides what the user already did in Readmoth", async () => {
    const { workId, editionId } = await addBook(db, "Dune", "Frank Herbert", "9780441172719");
    await setStatus(db, me, workId, "reading");
    await addCopy(db, me, { editionId });
    const report = await applyImport(db, me, parseImportCsv(fixture("goodreads.csv")));
    expect(report.statusesKept).toBe(1);
    expect(await getStatus(db, me, workId)).toBe("reading");
    const duneCopies = await db.query.copies.findMany({ where: (t, { eq }) => eq(t.editionId, editionId) });
    expect(duneCopies).toHaveLength(1);
    const duneReads = await db.query.readThroughs.findMany({ where: (t, { eq }) => eq(t.workId, workId) });
    expect(duneReads).toHaveLength(1);
  });

  it("merges a StoryGraph import on top of a Goodreads one by ISBN", async () => {
    await applyImport(db, me, parseImportCsv(fixture("goodreads.csv")));
    const report = await applyImport(db, me, parseImportCsv(fixture("storygraph.csv")));
    expect(report.imported).toBe(5);
    expect(await db.$count(works)).toBe(10);
  });

  it("keeps each user's import separate", async () => {
    const other = await makeUser(db, "Other");
    const parsed = parseImportCsv(fixture("storygraph.csv"));
    await applyImport(db, me, parsed);
    const theirs = await applyImport(db, other, parsed);
    expect(theirs.imported).toBe(5);
  });
});
