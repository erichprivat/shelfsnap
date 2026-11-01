import { beforeEach, describe, expect, it } from "vitest";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { upsertBook } from "./catalogue";
import { addCopy, lendCopy } from "./copies";
import { filterLibrary, libraryItems, libraryStats } from "./library";
import { createLocation } from "./locations";
import { setStatus } from "./reading";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

describe("library views", () => {
  it("answers the spec's example questions as filters", async () => {
    const shelf = await createLocation(db, me, { name: "Shelf" });
    const ownedUnread = await addBook(db, "Owned Unread", "A");
    const wish = await addBook(db, "Wishlist Only", "B");
    const ownedRead = await addBook(db, "Owned Read", "C");
    const eb = await upsertBook(db, { title: "An Ebook", authors: ["D"], edition: { binding: "ebook" } });
    await addCopy(db, me, { editionId: ownedUnread.editionId, locationId: shelf.id });
    const lent = await addCopy(db, me, { editionId: ownedRead.editionId });
    await addCopy(db, me, { editionId: eb.editionId });
    await setStatus(db, me, wish.workId, "want_to_read");
    await setStatus(db, me, ownedRead.workId, "read", { date: "2026-02-01", now: new Date("2026-06-01") });
    await lendCopy(db, me, lent.id, { to: "Ola", on: "2026-05-01", dueBack: "2026-05-15" }, new Date("2026-06-01"));
    await addBook(db, "Not tracked at all", "E");

    const items = await libraryItems(db, me);
    const titles = (f: Parameters<typeof filterLibrary>[1]) => filterLibrary(items, f).map((i) => i.title).sort();

    expect(items).toHaveLength(4);
    expect(titles({ ownership: "wishlist" })).toEqual(["Wishlist Only"]);
    expect(titles({ ownership: "owned", status: "none" })).toEqual(["An Ebook", "Owned Unread"]);
    expect(titles({ lent: true })).toEqual(["Owned Read"]);
    expect(titles({ format: "ebook" })).toEqual(["An Ebook"]);
    expect(titles({ locationId: shelf.id })).toEqual(["Owned Unread"]);
    expect(titles({ locationId: "unplaced" })).toEqual(["Owned Read"]);
    expect(titles({ q: "owned  READ" })).toEqual(["Owned Read"]);

    expect(libraryStats(items, "2026-06-01")).toMatchObject({
      owned: 3,
      physical: 2,
      digital: 1,
      wishlist: 1,
      lent: 1,
      overdue: 1,
      unplaced: 1,
      readThisYear: 1,
    });
  });

  it("shows the title of the edition you own, not the work's original title", async () => {
    const { editionId } = await upsertBook(db, { title: "La Peste", authors: ["Albert Camus"], openLibraryKey: "/works/OL1W", edition: { title: "The Plague", openLibraryKey: "/books/OL2M" } });
    await addCopy(db, me, { editionId });
    expect((await libraryItems(db, me))[0]!.title).toBe("The Plague");
  });

  it("never shows another user's books", async () => {
    const other = await makeUser(db, "Other");
    await addCopy(db, other, { editionId: (await addBook(db, "Theirs", "X")).editionId });
    expect(await libraryItems(db, me)).toEqual([]);
  });
});
