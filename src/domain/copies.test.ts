import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { copies } from "@/db/schema";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { upsertBook } from "./catalogue";
import { addCopy, findDuplicates, isOverdue, lendCopy, moveCopy, removeCopy, reorderCopy, returnCopy } from "./copies";
import { createLocation } from "./locations";
import { setStatus } from "./reading";
import type { IsoDate } from "./dates";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

const shelfOrder = async (locationId: string) =>
  (await db.query.copies.findMany({ where: eq(copies.locationId, locationId), orderBy: [asc(copies.position)] })).map((c) => c.id);

describe("addCopy", () => {
  it("appends to the end of the shelf", async () => {
    const shelf = await createLocation(db, me, { name: "Shelf" });
    const a = await addCopy(db, me, { editionId: (await addBook(db, "A", "X")).editionId, locationId: shelf.id });
    const b = await addCopy(db, me, { editionId: (await addBook(db, "B", "X")).editionId, locationId: shelf.id });
    expect(await shelfOrder(shelf.id)).toEqual([a.id, b.id]);
  });

  it("warns on a second copy of the same edition unless asked", async () => {
    const { editionId } = await addBook(db, "A", "X", "9780306406157");
    await addCopy(db, me, { editionId });
    await expect(addCopy(db, me, { editionId })).rejects.toMatchObject({ code: "conflict" });
    await addCopy(db, me, { editionId, allowDuplicate: true });
    expect((await findDuplicates(db, me, editionId)).sameEdition).toHaveLength(2);
  });

  it("allows an ebook alongside the physical copy of the same edition", async () => {
    const { editionId } = await addBook(db, "A", "X", "9780306406157");
    await addCopy(db, me, { editionId, format: "physical" });
    await addCopy(db, me, { editionId, format: "ebook" });
  });

  it("reports other editions of the same work separately", async () => {
    const a = await addBook(db, "Dune", "Frank Herbert", "9780441172719");
    const b = await addBook(db, "Dune", "Frank Herbert", "9780340960196");
    await addCopy(db, me, { editionId: a.editionId });
    const dupes = await findDuplicates(db, me, b.editionId);
    expect(dupes.sameEdition).toHaveLength(0);
    expect(dupes.otherEditions).toHaveLength(1);
  });

  it("derives the format from the binding and keeps ebooks off shelves", async () => {
    const shelf = await createLocation(db, me, { name: "Shelf" });
    const { editionId } = await upsertBook(db, { title: "E", authors: ["X"], edition: { binding: "ebook" } });
    expect((await addCopy(db, me, { editionId })).format).toBe("ebook");
    await expect(addCopy(db, me, { editionId, locationId: shelf.id, allowDuplicate: true })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects future and malformed acquired dates", async () => {
    const { editionId } = await addBook(db, "A", "X");
    await expect(addCopy(db, me, { editionId, acquiredAt: "2999-01-01" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(addCopy(db, me, { editionId, acquiredAt: "2023-02-30" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("won't add to someone else's shelf or a missing edition", async () => {
    const other = await makeUser(db, "Other");
    const theirs = await createLocation(db, other, { name: "Theirs" });
    const { editionId } = await addBook(db, "A", "X");
    await expect(addCopy(db, me, { editionId, locationId: theirs.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(addCopy(db, me, { editionId: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("ordering", () => {
  it("reorders to the front, the middle and after itself", async () => {
    const shelf = await createLocation(db, me, { name: "Shelf" });
    const ids = [];
    for (const t of ["A", "B", "C"]) ids.push((await addCopy(db, me, { editionId: (await addBook(db, t, "X")).editionId, locationId: shelf.id })).id);
    const [a, b, c] = ids as [string, string, string];
    await reorderCopy(db, me, c, null);
    expect(await shelfOrder(shelf.id)).toEqual([c, a, b]);
    await reorderCopy(db, me, c, a);
    expect(await shelfOrder(shelf.id)).toEqual([a, c, b]);
    await reorderCopy(db, me, c, c);
    expect(await shelfOrder(shelf.id)).toEqual([a, c, b]);
  });

  it("survives many inserts into the same gap by renumbering", async () => {
    const shelf = await createLocation(db, me, { name: "Shelf" });
    const a = await addCopy(db, me, { editionId: (await addBook(db, "A", "X")).editionId, locationId: shelf.id });
    const b = await addCopy(db, me, { editionId: (await addBook(db, "B", "X")).editionId, locationId: shelf.id });
    const c = await addCopy(db, me, { editionId: (await addBook(db, "C", "X")).editionId, locationId: shelf.id });
    // Alternate moves keep halving the gap right after A.
    for (let i = 0; i < 60; i++) await reorderCopy(db, me, i % 2 ? b.id : c.id, a.id);
    const order = await shelfOrder(shelf.id);
    expect(order[0]).toBe(a.id);
    expect(new Set(order).size).toBe(3);
  });

  it("refuses to order relative to a book on another shelf", async () => {
    const s1 = await createLocation(db, me, { name: "S1" });
    const s2 = await createLocation(db, me, { name: "S2" });
    const a = await addCopy(db, me, { editionId: (await addBook(db, "A", "X")).editionId, locationId: s1.id });
    const b = await addCopy(db, me, { editionId: (await addBook(db, "B", "X")).editionId, locationId: s2.id });
    await expect(reorderCopy(db, me, a.id, b.id)).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("moves to the end of the destination shelf", async () => {
    const s1 = await createLocation(db, me, { name: "S1" });
    const s2 = await createLocation(db, me, { name: "S2" });
    const a = await addCopy(db, me, { editionId: (await addBook(db, "A", "X")).editionId, locationId: s1.id });
    const b = await addCopy(db, me, { editionId: (await addBook(db, "B", "X")).editionId, locationId: s2.id });
    await moveCopy(db, me, a.id, s2.id);
    expect(await shelfOrder(s2.id)).toEqual([b.id, a.id]);
  });
});

describe("lending", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("lends, refuses double-lending, and returns", async () => {
    const c = await addCopy(db, me, { editionId: (await addBook(db, "A", "X")).editionId });
    const lent = await lendCopy(db, me, c.id, { to: "  Ingrid  " }, now);
    expect(lent).toMatchObject({ lentTo: "Ingrid", lentAt: "2026-06-15" });
    await expect(lendCopy(db, me, c.id, { to: "Ola" }, now)).rejects.toMatchObject({ code: "conflict" });
    expect((await returnCopy(db, me, c.id)).lentTo).toBeNull();
    expect((await returnCopy(db, me, c.id)).lentTo).toBeNull();
  });
  it("validates borrower and dates", async () => {
    const c = await addCopy(db, me, { editionId: (await addBook(db, "A", "X")).editionId });
    await expect(lendCopy(db, me, c.id, { to: " " }, now)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(lendCopy(db, me, c.id, { to: "Ola", on: "2026-06-10", dueBack: "2026-06-01" }, now)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(lendCopy(db, me, c.id, { to: "Ola", on: "2027-01-01" }, now)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("won't lend an ebook", async () => {
    const { editionId } = await upsertBook(db, { title: "E", authors: ["X"], edition: { binding: "ebook" } });
    const c = await addCopy(db, me, { editionId });
    await expect(lendCopy(db, me, c.id, { to: "Ola" }, now)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("computes overdue only for lent copies past their due date", () => {
    const today = "2026-06-15" as IsoDate;
    expect(isOverdue({ lentTo: "A", dueBackAt: "2026-06-14" }, today)).toBe(true);
    expect(isOverdue({ lentTo: "A", dueBackAt: "2026-06-15" }, today)).toBe(false);
    expect(isOverdue({ lentTo: "A", dueBackAt: null }, today)).toBe(false);
    expect(isOverdue({ lentTo: null, dueBackAt: "2026-01-01" }, today)).toBe(false);
  });
});

describe("removeCopy", () => {
  it("keeps reading history", async () => {
    const { editionId, workId } = await addBook(db, "A", "X");
    const c = await addCopy(db, me, { editionId });
    await setStatus(db, me, workId, "read");
    await removeCopy(db, me, c.id);
    expect(await db.query.readThroughs.findMany()).toHaveLength(1);
  });
  it("can't touch someone else's copy", async () => {
    const other = await makeUser(db, "Other");
    const c = await addCopy(db, other, { editionId: (await addBook(db, "A", "X")).editionId });
    await expect(removeCopy(db, me, c.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(lendCopy(db, me, c.id, { to: "Me" })).rejects.toMatchObject({ code: "not_found" });
  });
});
