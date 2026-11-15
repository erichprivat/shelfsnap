import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { snapSessions, snapSpines } from "@/db/schema";
import type { DetectedSpine, SpineReader } from "@/sources/spine-reader";
import { addBook, book, makeUser, testDb, type TestDb } from "@/test/db";
import type { BookRecord, CatalogueSource } from "./catalogue";
import { addCopy } from "./copies";
import { commitSnap, correctSpine, createSnapSession, processSnap, rejectSpine, rematchSnap } from "./snap";

// Made-up books, so matching depends only on the text below.
const LANTERNS = { title: "Lanterns Over Brine", author: "Quill Marrowby" };
const ORCHARD = { title: "The Glass Orchard", author: "Tamsin Ferrow" };

const spine = (text: string, title: string | null = null, author: string | null = null): DetectedSpine => ({ text, title, author, box: null });
const shelfSpines = () => [
  spine(`${LANTERNS.title} ${LANTERNS.author}`, LANTERNS.title, LANTERNS.author),
  spine(`${ORCHARD.title} ${ORCHARD.author}`, ORCHARD.title, ORCHARD.author),
];
const shelfBooks = () => [book(LANTERNS.title, LANTERNS.author), book(ORCHARD.title, ORCHARD.author)];

const reader = (spines: DetectedSpine[]): SpineReader => ({ name: "fake", read: async () => ({ spines, isShelf: true, usage: null }) });
const counting = (impl: (q: string) => Promise<BookRecord[]>) => {
  const stats = { calls: 0, inFlight: 0, peak: 0 };
  const run = async (q: string) => {
    stats.calls++;
    stats.peak = Math.max(stats.peak, ++stats.inFlight);
    try {
      return await impl(q);
    } finally {
      stats.inFlight--;
    }
  };
  const source: CatalogueSource = { lookupIsbn: async () => null, search: (q) => run(q), searchByTitle: (t) => run(t) };
  return { source, stats };
};
const up = (records: BookRecord[] = []) =>
  counting(async (q) => {
    const words = q.toLowerCase().split(/\s+/);
    return records.filter((r) => words.some((w) => w.length > 2 && r.title.toLowerCase().includes(w)));
  }).source;
const down = () => counting(async () => Promise.reject(new Error("offline")));
const image = new Uint8Array([1, 2, 3]);

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

async function snap(spines: DetectedSpine[], catalogue: CatalogueSource) {
  const session = await createSnapSession(db, me, { imagePath: "x.jpg", locationId: null });
  await processSnap(db, reader(spines), catalogue, me, session.id, image);
  return session.id;
}
const rows = (sessionId: string) => db.query.snapSpines.findMany({ where: eq(snapSpines.sessionId, sessionId), orderBy: [asc(snapSpines.ordinal)] });

describe("when the catalogue can't be reached", () => {
  it("records on each spine that it wasn't looked up", async () => {
    const id = await snap(shelfSpines(), down().source);
    expect((await rows(id)).map((r) => [r.state, r.catalogueFailed])).toEqual([
      ["unmatched", true],
      ["unmatched", true],
    ]);
  });

  it("doesn't flag spines the catalogue answered, even with no match", async () => {
    const id = await snap([spine("NOTHING LIKE IT")], up());
    expect((await rows(id))[0]).toMatchObject({ state: "unmatched", catalogueFailed: false });
  });

  it("stops calling it instead of waiting on every spine", async () => {
    const { source, stats } = down();
    const id = await snap(Array.from({ length: 9 }, (_, i) => spine(`Volume number ${i}`, `Volume number ${i}`, "Quill Marrowby")), source);
    expect((await rows(id)).every((r) => r.state === "unmatched" && r.catalogueFailed)).toBe(true);
    // Only the lookups already in flight when the first one failed.
    expect(stats.calls).toBeLessThanOrEqual(2);
  });

  it("looks up at most two spines at once", async () => {
    const { source, stats } = counting(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [];
    });
    await snap(Array.from({ length: 6 }, (_, i) => spine(`Volume number ${i}`)), source);
    expect(stats.peak).toBe(2);
  });
});

describe("match again", () => {
  it("matches spines from their stored text once the catalogue is back, even with the photo gone", async () => {
    const id = await snap(shelfSpines(), down().source);
    await db.update(snapSessions).set({ photoDeletedAt: new Date() }).where(eq(snapSessions.id, id));
    expect(await rematchSnap(db, up(shelfBooks()), me, id)).toEqual({ found: 2, stillFailed: 0 });
    const after = await rows(id);
    expect(after.map((r) => r.state)).toEqual(["matched", "matched"]);
    expect(after.every((r) => !r.catalogueFailed && r.chosenEditionId)).toBe(true);
  });

  it("reports when the catalogue is still down and keeps the spines flagged", async () => {
    const id = await snap(shelfSpines(), down().source);
    expect(await rematchSnap(db, down().source, me, id)).toEqual({ found: 0, stillFailed: 2 });
    expect((await rows(id)).every((r) => r.state === "unmatched" && r.catalogueFailed)).toBe(true);
  });

  it("leaves spines the reader already decided on alone", async () => {
    const id = await snap(shelfSpines(), down().source);
    const [first, second] = await rows(id);
    await rejectSpine(db, me, first!.id);
    await correctSpine(db, me, second!.id, { title: "Something else entirely" });
    expect(await rematchSnap(db, up(shelfBooks()), me, id)).toEqual({ found: 0, stillFailed: 0 });
    expect((await rows(id)).map((r) => r.state)).toEqual(["rejected", "confirmed"]);
  });

  it("marks a book the reader already owns as a duplicate", async () => {
    const id = await snap([shelfSpines()[0]!], down().source);
    const { editionId } = await addBook(db, LANTERNS.title, LANTERNS.author);
    await addCopy(db, me, { editionId });
    await rematchSnap(db, up(), me, id);
    expect((await rows(id))[0]!.state).toBe("duplicate");
  });

  it("still works for spines read before title and author were stored", async () => {
    const id = await snap(shelfSpines(), down().source);
    await db.update(snapSpines).set({ title: null, author: null }).where(eq(snapSpines.sessionId, id));
    expect(await rematchSnap(db, up(shelfBooks()), me, id)).toEqual({ found: 2, stillFailed: 0 });
  });

  it("keeps the candidates a spine already had", async () => {
    const id = await snap([spine("THE GLASS ORCHARD AND")], up([book(ORCHARD.title, ORCHARD.author)]));
    const before = (await rows(id))[0]!;
    expect(before.candidates.length).toBeGreaterThan(0);
    await db.update(snapSpines).set({ state: "unmatched", chosenEditionId: null, catalogueFailed: true }).where(eq(snapSpines.id, before.id));
    await rematchSnap(db, down().source, me, id);
    const after = (await rows(id))[0]!;
    expect(after.candidates.map((c) => c.editionId)).toEqual(before.candidates.map((c) => c.editionId));
    expect(after.state).toBe(before.state);
  });

  it("is refused for other readers and after commit", async () => {
    const id = await snap(shelfSpines(), down().source);
    const stranger = await makeUser(db, "Stranger");
    await expect(rematchSnap(db, up(shelfBooks()), stranger, id)).rejects.toThrow();
    const [first] = await rows(id);
    await correctSpine(db, me, first!.id, { title: LANTERNS.title, author: LANTERNS.author });
    await commitSnap(db, me, id);
    await expect(rematchSnap(db, up(shelfBooks()), me, id)).rejects.toThrow(/already been added/);
  });
});
