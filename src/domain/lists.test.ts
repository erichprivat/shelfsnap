import { beforeEach, describe, expect, it } from "vitest";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { addToList, createList, deleteList, listWithItems, moveInList, removeFromList, shareList, unshareList, updateList } from "./lists";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

const titles = async (id: string) => (await listWithItems(db, { userId: me, id })).items.map((i) => i.work.title);

describe("lists", () => {
  it("validates names and descriptions", async () => {
    await expect(createList(db, me, { name: " " })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createList(db, me, { name: "x".repeat(81) })).rejects.toMatchObject({ code: "invalid_input" });
    const l = await createList(db, me, { name: " Summer  reads ", description: "  " });
    expect(l).toMatchObject({ name: "Summer reads", description: null });
  });

  it("adds in order, refuses duplicates, removes and reorders", async () => {
    const l = await createList(db, me, { name: "L" });
    const a = await addBook(db, "Alpha", "X");
    const b = await addBook(db, "Bravo", "X");
    const c = await addBook(db, "Charlie", "X");
    for (const w of [a, b, c]) await addToList(db, me, l.id, w.workId);
    await expect(addToList(db, me, l.id, a.workId)).rejects.toMatchObject({ code: "conflict" });
    await moveInList(db, me, l.id, c.workId, null);
    expect(await titles(l.id)).toEqual(["Charlie", "Alpha", "Bravo"]);
    await moveInList(db, me, l.id, c.workId, b.workId);
    expect(await titles(l.id)).toEqual(["Alpha", "Bravo", "Charlie"]);
    await removeFromList(db, me, l.id, b.workId);
    expect(await titles(l.id)).toEqual(["Alpha", "Charlie"]);
  });

  it("can hold books the user doesn't own", async () => {
    const l = await createList(db, me, { name: "Wishlist" });
    const w = await addBook(db, "Not mine", "X");
    await addToList(db, me, l.id, w.workId);
    expect(await titles(l.id)).toEqual(["Not mine"]);
  });

  it("shares with a stable random slug and unshares", async () => {
    const l = await createList(db, me, { name: "L" });
    const slug = await shareList(db, me, l.id);
    expect(slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(await shareList(db, me, l.id)).toBe(slug);
    expect((await listWithItems(db, { slug })).id).toBe(l.id);
    await unshareList(db, me, l.id);
    await expect(listWithItems(db, { slug })).rejects.toMatchObject({ code: "not_found" });
  });

  it("is private to its owner", async () => {
    const other = await makeUser(db, "Other");
    const l = await createList(db, other, { name: "Theirs" });
    const w = await addBook(db, "Book", "X");
    await expect(addToList(db, me, l.id, w.workId)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateList(db, me, l.id, { name: "Hacked" })).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteList(db, me, l.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listWithItems(db, { userId: me, id: l.id })).rejects.toMatchObject({ code: "not_found" });
  });
});
