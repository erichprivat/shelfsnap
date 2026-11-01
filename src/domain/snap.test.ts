import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { copies, snapSpines } from "@/db/schema";
import { SpineReaderError, type DetectedSpine, type SpineReader } from "@/sources/spine-reader";
import { addBook, book, makeUser, testDb, type TestDb } from "@/test/db";
import type { BookRecord, CatalogueSource } from "./catalogue";
import { addCopy } from "./copies";
import { createLocation } from "./locations";
import {
  classify,
  commitSnap,
  confirmAllMatched,
  confirmSpine,
  createSnapSession,
  processSnap,
  rejectSpine,
  scoreCandidate,
  validateSnapUpload,
} from "./snap";

const spine = (text: string, title: string | null = null, author: string | null = null): DetectedSpine => ({ text, title, author, box: null });
const reader = (spines: DetectedSpine[] | Error): SpineReader => ({
  name: "fake",
  read: async () => {
    if (spines instanceof Error) throw spines;
    return spines;
  },
});
const catalogue = (records: BookRecord[] = [], opts: { down?: boolean } = {}): CatalogueSource => ({
  lookupIsbn: async () => null,
  search: async (q) => {
    if (opts.down) throw new Error("offline");
    const words = q.toLowerCase().split(/\s+/);
    return records.filter((r) => words.some((w) => w.length > 2 && r.title.toLowerCase().includes(w)));
  },
});
const image = new Uint8Array([1, 2, 3]);

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

async function snap(spines: DetectedSpine[] | Error, records: BookRecord[] = [], locationId: string | null = null, opts = {}) {
  const session = await createSnapSession(db, me, { imagePath: "x.jpg", locationId });
  const result = await processSnap(db, reader(spines), catalogue(records, opts), me, session.id, image);
  const rows = await db.query.snapSpines.findMany({ where: eq(snapSpines.sessionId, session.id), orderBy: [asc(snapSpines.ordinal)] });
  return { session: result, rows };
}

describe("scoring", () => {
  it("scores an exact title and author highly", () => {
    expect(scoreCandidate(spine("PIRANESI SUSANNA CLARKE"), { title: "Piranesi", authors: ["Susanna Clarke"] })).toBeGreaterThan(0.95);
  });
  it("gives nothing when the title is missing, whatever the author", () => {
    expect(scoreCandidate(spine("SUSANNA CLARKE"), { title: "Jonathan Strange & Mr Norrell", authors: ["Susanna Clarke"] })).toBe(0);
  });
  it("leans on the author for one-word titles", () => {
    const right = scoreCandidate(spine("SULT KNUT HAMSUN"), { title: "Sult", authors: ["Knut Hamsun"] });
    const wrong = scoreCandidate(spine("SULT KNUT HAMSUN"), { title: "Sult", authors: ["Someone Else"] });
    expect(right).toBeGreaterThanOrEqual(0.8);
    expect(wrong).toBeLessThan(0.6);
  });
  it("classifies by confidence and margin", () => {
    expect(classify([], false)).toBe("unmatched");
    expect(classify([{ score: 0.3 }], false)).toBe("unmatched");
    expect(classify([{ score: 0.6 }], false)).toBe("ambiguous");
    expect(classify([{ score: 0.95 }, { score: 0.9 }], false)).toBe("ambiguous");
    expect(classify([{ score: 0.95 }, { score: 0.5 }], false)).toBe("matched");
    expect(classify([{ score: 0.95 }], true)).toBe("duplicate");
  });
});

describe("validateSnapUpload", () => {
  it("rejects empty, huge and non-image files", () => {
    expect(() => validateSnapUpload({ size: 0, type: "image/jpeg" })).toThrow();
    expect(() => validateSnapUpload({ size: 21 * 1024 * 1024, type: "image/jpeg" })).toThrow();
    expect(() => validateSnapUpload({ size: 10, type: "application/pdf" })).toThrow();
    expect(() => validateSnapUpload({ size: 10, type: "image/heic" })).not.toThrow();
  });
});

describe("processSnap", () => {
  it("sorts spines into matched, ambiguous and unmatched in shelf order", async () => {
    const { session, rows } = await snap(
      [spine("PIRANESI SUSANNA CLARKE", "Piranesi", "Susanna Clarke"), spine("THE REMAINS OF THE"), spine("~~~"), spine("WAR")],
      [book("Piranesi", "Susanna Clarke"), book("The Remains of the Day", "Kazuo Ishiguro"), book("War and Peace", "Leo Tolstoy"), book("The War of the Worlds", "H. G. Wells")],
    );
    expect(session.status).toBe("ready");
    expect(rows.map((r) => r.state)).toEqual(["matched", "ambiguous", "ambiguous"]);
    expect(rows[0]!.chosenEditionId).not.toBeNull();
    expect(rows[1]!.candidates.length).toBeGreaterThan(0);
  });

  it("prefers books already in the local catalogue without calling out", async () => {
    await addBook(db, "Stoner", "John Williams");
    const { rows } = await snap([spine("STONER JOHN WILLIAMS", "Stoner", "John Williams")], [], null, { down: true });
    expect(rows[0]!.state).toBe("matched");
  });

  it("flags books the user already owns as duplicates", async () => {
    const { editionId } = await addBook(db, "Stoner", "John Williams");
    await addCopy(db, me, { editionId });
    const { rows } = await snap([spine("STONER JOHN WILLIAMS", "Stoner", "John Williams")]);
    expect(rows[0]!.state).toBe("duplicate");
  });

  it("degrades to unmatched when the catalogue is down", async () => {
    const { session, rows } = await snap([spine("PIRANESI SUSANNA CLARKE")], [], null, { down: true });
    expect(session.status).toBe("ready");
    expect(rows[0]!.state).toBe("unmatched");
  });

  it("records reader failures on the session with a friendly message", async () => {
    const { session } = await snap(new SpineReaderError("Try a closer shot."));
    expect(session).toMatchObject({ status: "failed", error: "Try a closer shot." });
    const { session: unknown } = await snap(new Error("boom"));
    expect(unknown.error).not.toContain("boom");
  });

  it("handles a photo with no books", async () => {
    const { session, rows } = await snap([]);
    expect(session.status).toBe("ready");
    expect(rows).toEqual([]);
  });

  it("can be retried after a failure without duplicating spines", async () => {
    const session = await createSnapSession(db, me, { imagePath: "x.jpg", locationId: null });
    await processSnap(db, reader(new SpineReaderError("x")), catalogue(), me, session.id, image);
    await processSnap(db, reader([spine("A BOOK")]), catalogue(), me, session.id, image);
    await processSnap(db, reader([spine("A BOOK"), spine("ANOTHER")]), catalogue(), me, session.id, image);
    expect(await db.$count(snapSpines, eq(snapSpines.sessionId, session.id))).toBe(1);
  });
});

describe("review and commit", () => {
  it("confirms matches in one tap and adds them in shelf order after existing books", async () => {
    const shelf = await createLocation(db, me, { name: "Shelf" });
    const existing = await addCopy(db, me, { editionId: (await addBook(db, "Already Here", "Someone")).editionId, locationId: shelf.id });
    const { session, rows } = await snap(
      [spine("STONER JOHN WILLIAMS", "Stoner", "John Williams"), spine("PIRANESI SUSANNA CLARKE", "Piranesi", "Susanna Clarke")],
      [book("Stoner", "John Williams"), book("Piranesi", "Susanna Clarke")],
      shelf.id,
    );
    expect(await confirmAllMatched(db, me, session.id)).toBe(2);
    expect(await commitSnap(db, me, session.id)).toEqual({ added: 2 });
    const onShelf = await db.query.copies.findMany({
      where: eq(copies.locationId, shelf.id),
      orderBy: [asc(copies.position)],
      with: { edition: true },
    });
    expect(onShelf.map((c) => c.edition.title)).toEqual(["Already Here", "Stoner", "Piranesi"]);
    expect(onShelf[0]!.id).toBe(existing.id);
    expect(rows).toHaveLength(2);
  });

  it("is idempotent and locks the session after commit", async () => {
    const { session, rows } = await snap([spine("STONER JOHN WILLIAMS", "Stoner", "John Williams")], [book("Stoner", "John Williams")]);
    await confirmAllMatched(db, me, session.id);
    await commitSnap(db, me, session.id);
    expect(await commitSnap(db, me, session.id)).toEqual({ added: 0 });
    await expect(rejectSpine(db, me, rows[0]!.id)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.$count(copies)).toBe(1);
  });

  it("only adds confirmed spines; rejected and unresolved ones are skipped", async () => {
    const { session, rows } = await snap(
      [spine("STONER JOHN WILLIAMS", "Stoner", "John Williams"), spine("THE REMAINS OF THE"), spine("PIRANESI SUSANNA CLARKE", "Piranesi", "Susanna Clarke")],
      [book("Stoner", "John Williams"), book("The Remains of the Day", "Kazuo Ishiguro"), book("Piranesi", "Susanna Clarke")],
    );
    await rejectSpine(db, me, rows[0]!.id);
    await confirmAllMatched(db, me, session.id);
    expect(await commitSnap(db, me, session.id)).toEqual({ added: 1 });
  });

  it("lets the user pick a candidate for an ambiguous spine, and requires a pick", async () => {
    const { rows } = await snap([spine("THE REMAINS OF THE")], [book("The Remains of the Day", "Kazuo Ishiguro")]);
    const amb = rows[0]!;
    await expect(confirmSpine(db, me, amb.id)).rejects.toMatchObject({ code: "invalid_input" });
    await confirmSpine(db, me, amb.id, amb.candidates[0]!.editionId);
    await expect(confirmSpine(db, me, amb.id, "missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps duplicates out of the one-tap confirm, but adds them when confirmed explicitly", async () => {
    const { editionId } = await addBook(db, "Stoner", "John Williams");
    await addCopy(db, me, { editionId });
    const { session, rows } = await snap([spine("STONER JOHN WILLIAMS", "Stoner", "John Williams")]);
    expect(await confirmAllMatched(db, me, session.id)).toBe(0);
    await confirmSpine(db, me, rows[0]!.id);
    expect(await commitSnap(db, me, session.id)).toEqual({ added: 1 });
    expect(await db.$count(copies)).toBe(2);
  });

  it("is private to the owner", async () => {
    const { session, rows } = await snap([spine("STONER JOHN WILLIAMS", "Stoner", "John Williams")], [book("Stoner", "John Williams")]);
    const other = await makeUser(db, "Other");
    await expect(confirmAllMatched(db, other, session.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(confirmSpine(db, other, rows[0]!.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(commitSnap(db, other, session.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("truncated and noisy spines", () => {
  it("never reaches confident from a fragment alone", () => {
    expect(scoreCandidate(spine("THE REMAINS OF THE"), { title: "The Remains of the Day", authors: ["Kazuo Ishiguro"] })).toBeLessThan(0.8);
    expect(scoreCandidate(spine("THE REMAINS OF THE"), { title: "The Remains of the Day", authors: ["Kazuo Ishiguro"] })).toBeGreaterThanOrEqual(0.45);
  });
  it("treats a contradicting author on the spine as evidence against", () => {
    expect(scoreCandidate(spine("SULT KNUT HAMSUN"), { title: "Sult", authors: ["Someone Else"] })).toBeLessThan(0.6);
  });
  it("still finds a book under publisher noise when the author is read", () => {
    expect(scoreCandidate(spine("PIRANESI SUSANNA CLARKE BLOOMSBURY", "Piranesi", "Susanna Clarke"), { title: "Piranesi", authors: ["Susanna Clarke"] })).toBeGreaterThanOrEqual(0.8);
  });
});
