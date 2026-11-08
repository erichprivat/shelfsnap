import { eq } from "drizzle-orm";
import Papa from "papaparse";
import { beforeEach, describe, expect, it } from "vitest";
import { copies, editions, feedback, locations, modelUsage, readThroughs, session, snapSessions, snapSpines, user, verification, works } from "@/db/schema";
import { addBook, book, makeUser, testDb, type TestDb } from "@/test/db";
import { deleteAccount, exportLibraryCsv } from "./account";
import { upsertBook } from "./catalogue";
import { addCopy, lendCopy } from "./copies";
import { applyImport } from "./import/apply";
import { parseImportCsv } from "./import/parse";
import { libraryItems } from "./library";
import { addToList, createList } from "./lists";
import { submitFeedback } from "./feedback";
import { createLocation } from "./locations";
import { setStatus, updateReadThrough } from "./reading";
import { recordUsage } from "./usage";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

const rows = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true }).data;

async function shelvedLibrary() {
  const home = await createLocation(db, me, { name: "Home" });
  const shelf = await createLocation(db, me, { name: "Shelf 3", parentId: home.id });
  const dune = await upsertBook(db, book("Dune", "Frank Herbert", "9780441172719", { authors: ["Frank Herbert", "Brian Herbert"] }));
  const copy = await addCopy(db, me, { editionId: dune.editionId, locationId: shelf.id });
  await setStatus(db, me, dune.workId, "read", { date: "2024-03-02" });
  const rt = await db.query.readThroughs.findFirst({ where: eq(readThroughs.workId, dune.workId) });
  await updateReadThrough(db, me, rt!.id, { rating: 7, review: 'Spice, "worms" & politics,\nall at once.' });
  await lendCopy(db, me, copy.id, { to: "Ada", dueBack: "2099-01-01" });

  const wish = await addBook(db, "Piranesi", "Susanna Clarke");
  await setStatus(db, me, wish.workId, "want_to_read");
  const ebook = await addBook(db, "The Summer Book", "Tove Jansson");
  await addCopy(db, me, { editionId: ebook.editionId, format: "ebook" });
  return { dune, wish, ebook };
}

describe("exportLibraryCsv", () => {
  it("writes Goodreads columns with Readmoth extras at the end", async () => {
    await shelvedLibrary();
    const csv = await exportLibraryCsv(db, me);
    const [header] = csv.split("\n");
    expect(header.startsWith("Book Id,Title,Author,Additional Authors,ISBN13,My Rating")).toBe(true);
    expect(header.endsWith("Format,Location,Lent To,Due Back")).toBe(true);

    const dune = rows(csv).find((r) => r.Title === "Dune")!;
    expect(dune).toMatchObject({
      Author: "Frank Herbert",
      "Additional Authors": "Brian Herbert",
      ISBN13: "9780441172719",
      "My Rating": "4",
      "Date Read": "2024/03/02",
      "Exclusive Shelf": "read",
      "My Review": 'Spice, "worms" & politics,\nall at once.',
      "Read Count": "1",
      "Owned Copies": "1",
      Bookshelves: "owned",
      Location: "Home › Shelf 3",
      "Lent To": "Ada",
      "Due Back": "2099-01-01",
    });
    expect(rows(csv).find((r) => r.Title === "Piranesi")).toMatchObject({ "Exclusive Shelf": "to-read", "Owned Copies": "0" });
    expect(rows(csv).find((r) => r.Title === "The Summer Book")).toMatchObject({ Bookshelves: "ebook", Format: "ebook", "Exclusive Shelf": "" });
  });

  it("re-imports into a fresh account as the same library", async () => {
    await shelvedLibrary();
    const csv = await exportLibraryCsv(db, me);
    const other = await makeUser(db, "Other");
    const report = await applyImport(db, other, parseImportCsv(csv));
    expect(report.imported).toBe(3);

    const summary = async (uid: string) =>
      (await libraryItems(db, uid))
        .map((i) => ({ title: i.title, status: i.status, formats: i.copies.map((c) => c.format).sort() }))
        .sort((a, b) => a.title.localeCompare(b.title));
    expect(await summary(other)).toEqual(await summary(me));
  });

  it("still writes the header row for an empty library", async () => {
    expect(await exportLibraryCsv(db, me)).toMatch(/^Book Id,Title,.*,Due Back\n?$/);
  });

  it("only exports the requesting user's books", async () => {
    await shelvedLibrary();
    const other = await makeUser(db, "Other");
    const theirs = await addBook(db, "Not mine", "X");
    await addCopy(db, other, { editionId: theirs.editionId });
    expect(rows(await exportLibraryCsv(db, me)).map((r) => r.Title)).not.toContain("Not mine");
  });
});

describe("deleteAccount", () => {
  it("removes everything the user owns and nothing anyone else does", async () => {
    const { dune } = await shelvedLibrary();
    const list = await createList(db, me, { name: "Favourites" });
    await addToList(db, me, list.id, dune.workId);
    const [snap] = await db.insert(snapSessions).values({ userId: me, imagePath: `${me}/x.jpg`, status: "ready" }).returning();
    await db.insert(snapSpines).values({ sessionId: snap.id, ordinal: 0, rawText: "Dune", state: "matched" });
    await recordUsage(db, me, snap.id, { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 5 });
    await submitFeedback(db, me, { message: "Love it" });
    const myEmail = (await db.query.user.findFirst({ where: eq(user.id, me) }))!.email;
    const expiry = new Date(Date.now() + 60_000);
    await db.insert(session).values({ id: "s1", userId: me, token: "t1", expiresAt: expiry });
    await db.insert(verification).values([
      { id: "v1", identifier: "tok-a", value: JSON.stringify({ email: myEmail }), expiresAt: expiry },
      // An address that would match if "_" or "%" were treated as wildcards.
      { id: "v2", identifier: "tok-b", value: JSON.stringify({ email: myEmail.replace(/^./, "%") }), expiresAt: expiry },
    ]);

    const other = await makeUser(db, "Other");
    const theirs = await addBook(db, "Theirs", "Y");
    await addCopy(db, other, { editionId: theirs.editionId });
    await createLocation(db, other, { name: "Their room" });

    await deleteAccount(db, me);

    expect(await db.query.user.findFirst({ where: eq(user.id, me) })).toBeUndefined();
    for (const [table, col] of [
      [copies, copies.userId],
      [locations, locations.userId],
      [readThroughs, readThroughs.userId],
      [snapSessions, snapSessions.userId],
      [modelUsage, modelUsage.userId],
      [session, session.userId],
      [feedback, feedback.userId],
    ] as const) {
      expect(await db.select().from(table).where(eq(col, me))).toHaveLength(0);
    }
    expect(await db.select().from(snapSpines)).toHaveLength(0);
    expect((await db.select().from(verification)).map((v) => v.id)).toEqual(["v2"]);
    expect(await db.query.lists.findMany()).toHaveLength(0);

    expect(await db.select().from(copies).where(eq(copies.userId, other))).toHaveLength(1);
    expect(await db.select().from(locations).where(eq(locations.userId, other))).toHaveLength(1);
    // The shared catalogue stays.
    expect(await db.query.works.findFirst({ where: eq(works.id, dune.workId) })).toBeDefined();
    expect(await db.query.editions.findFirst({ where: eq(editions.id, dune.editionId) })).toBeDefined();
  });

  it("does nothing for an unknown user", async () => {
    await expect(deleteAccount(db, "nobody")).resolves.toBeUndefined();
  });
});
