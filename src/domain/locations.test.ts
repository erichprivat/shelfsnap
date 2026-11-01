import { beforeEach, describe, expect, it } from "vitest";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { addCopy } from "./copies";
import { createLocation, deleteLocation, locationPath, locationTree, MAX_LOCATION_DEPTH, moveLocation, renameLocation } from "./locations";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

describe("createLocation", () => {
  it("trims and collapses whitespace in names", async () => {
    const l = await createLocation(db, me, { name: "  Living   room " });
    expect(l.name).toBe("Living room");
  });
  it("rejects empty and overlong names", async () => {
    await expect(createLocation(db, me, { name: "   " })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createLocation(db, me, { name: "x".repeat(61) })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("rejects sibling names that differ only by case or accents", async () => {
    const home = await createLocation(db, me, { name: "Home" });
    await createLocation(db, me, { name: "Café shelf", parentId: home.id });
    await expect(createLocation(db, me, { name: "cafe SHELF", parentId: home.id })).rejects.toMatchObject({ code: "conflict" });
    await createLocation(db, me, { name: "Café shelf" });
  });
  it("enforces the nesting limit", async () => {
    let parentId: string | null = null;
    for (let i = 0; i < MAX_LOCATION_DEPTH; i++) parentId = (await createLocation(db, me, { name: `L${i}`, parentId })).id;
    await expect(createLocation(db, me, { name: "too deep", parentId })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("won't nest under someone else's location", async () => {
    const other = await makeUser(db, "Other");
    const theirs = await createLocation(db, other, { name: "Theirs" });
    await expect(createLocation(db, me, { name: "Mine", parentId: theirs.id })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("moveLocation", () => {
  it("refuses to move a location inside itself or its descendants", async () => {
    const a = await createLocation(db, me, { name: "A" });
    const b = await createLocation(db, me, { name: "B", parentId: a.id });
    await expect(moveLocation(db, me, a.id, a.id)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(moveLocation(db, me, a.id, b.id)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("counts the moved subtree against the depth limit", async () => {
    const a = await createLocation(db, me, { name: "A" });
    const a1 = await createLocation(db, me, { name: "A1", parentId: a.id });
    await createLocation(db, me, { name: "A2", parentId: a1.id });
    const b = await createLocation(db, me, { name: "B" });
    const b1 = await createLocation(db, me, { name: "B1", parentId: b.id });
    await expect(moveLocation(db, me, a.id, b1.id)).rejects.toMatchObject({ code: "invalid_input" });
    await moveLocation(db, me, a.id, b.id);
    expect((await locationPath(db, me, a1.id)).map((l) => l.name)).toEqual(["B", "A", "A1"]);
  });
  it("checks for a name clash at the destination", async () => {
    const a = await createLocation(db, me, { name: "A" });
    await createLocation(db, me, { name: "Shelf", parentId: a.id });
    const loose = await createLocation(db, me, { name: "shelf" });
    await expect(moveLocation(db, me, loose.id, a.id)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("renameLocation", () => {
  it("allows changing only the case of its own name", async () => {
    const a = await createLocation(db, me, { name: "office" });
    expect((await renameLocation(db, me, a.id, "Office")).name).toBe("Office");
  });
});

describe("deleteLocation", () => {
  it("moves books and sub-locations up instead of losing them, preserving order", async () => {
    const home = await createLocation(db, me, { name: "Home" });
    const shelf = await createLocation(db, me, { name: "Shelf", parentId: home.id });
    const nook = await createLocation(db, me, { name: "Nook", parentId: shelf.id });
    const already = await addCopy(db, me, { editionId: (await addBook(db, "Already", "A")).editionId, locationId: home.id });
    const c1 = await addCopy(db, me, { editionId: (await addBook(db, "One", "A")).editionId, locationId: shelf.id });
    const c2 = await addCopy(db, me, { editionId: (await addBook(db, "Two", "A")).editionId, locationId: shelf.id });

    expect(await deleteLocation(db, me, shelf.id)).toEqual({ movedCopies: 2, movedLocations: 1 });
    const moved = await db.query.copies.findMany({ where: (t, { eq }) => eq(t.locationId, home.id), orderBy: (t, { asc }) => [asc(t.position)] });
    expect(moved.map((c) => c.id)).toEqual([already.id, c1.id, c2.id]);
    expect((await locationPath(db, me, nook.id)).map((l) => l.name)).toEqual(["Home", "Nook"]);
  });
  it("refuses when a child's name would clash with a sibling above", async () => {
    const home = await createLocation(db, me, { name: "Home" });
    await createLocation(db, me, { name: "Shelf", parentId: home.id });
    const room = await createLocation(db, me, { name: "Room", parentId: home.id });
    await createLocation(db, me, { name: "Shelf", parentId: room.id });
    await expect(deleteLocation(db, me, room.id)).rejects.toMatchObject({ code: "conflict" });
  });
  it("is scoped to the owner", async () => {
    const other = await makeUser(db, "Other");
    const theirs = await createLocation(db, other, { name: "Theirs" });
    await expect(deleteLocation(db, me, theirs.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

it("locationTree nests and counts copies", async () => {
  const home = await createLocation(db, me, { name: "Home" });
  const shelf = await createLocation(db, me, { name: "Shelf", parentId: home.id });
  await addCopy(db, me, { editionId: (await addBook(db, "One", "A")).editionId, locationId: shelf.id });
  const tree = await locationTree(db, me);
  expect(tree).toHaveLength(1);
  expect(tree[0]!.children[0]).toMatchObject({ name: "Shelf", copyCount: 1 });
});
