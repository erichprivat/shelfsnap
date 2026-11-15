import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bingoSquares, challenges, copies } from "@/db/schema";
import { addBook, book, makeUser, testDb, type TestDb } from "@/test/db";
import { randomCard, seededRng } from "./bingo-categories";
import { upsertBook } from "./catalogue";
import {
  bingoBoard,
  bookInChallenges,
  challengesFor,
  createChallenge,
  daysLeft,
  deleteChallenge,
  ensureFeaturedChallenges,
  expectedByNow,
  featuredFor,
  joinByCode,
  joinFeatured,
  leaveChallenge,
  membersWithProgress,
  placeBook,
  visibleChallenge,
} from "./challenges";
import { addCopy } from "./copies";
import { setStatus } from "./reading";

let db: TestDb;
let me: string;
let friend: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db, "Ada Quill");
  friend = await makeUser(db, "Bo Ferren");
});

const year = { startsOn: "2027-01-01", endsOn: "2027-12-31" };
const now = new Date("2028-01-15T12:00:00Z");
const finish = (userId: string, workId: string, date: string) => setStatus(db, userId, workId, "read", { date, now });

describe("books per year", () => {
  it("counts only books finished inside the window, once each", async () => {
    const c = await createChallenge(db, me, { kind: "books", title: "24 in 2027", target: 24, ...year });
    const a = await addBook(db, "Mothwing", "Ada Quill");
    const b = await addBook(db, "Lantern Harbour", "Bo Ferren");
    const old = await addBook(db, "Old Read", "Someone");
    await finish(me, a.workId, "2027-02-01");
    await finish(me, b.workId, "2027-12-31");
    await finish(me, old.workId, "2026-12-31");
    const [card] = await challengesFor(db, me);
    expect(card).toMatchObject({ id: c.id, joined: true, members: 1, progress: { done: 2, goal: 24 } });
  });

  it("deals smaller cards: 3×3 has 8 books around a free middle, 4×4 has 16", async () => {
    const small = await createChallenge(db, me, { kind: "bingo", title: "Small", card: randomCard("classic", 3, seededRng(1)), theme: "classic", ...year });
    const mid = await createChallenge(db, me, { kind: "bingo", title: "Mid", card: randomCard("classic", 4, seededRng(1)), theme: "classic", ...year });
    const goals = Object.fromEntries((await challengesFor(db, me)).map((c) => [c.title, c.progress.goal]));
    expect(goals).toEqual({ Small: 8, Mid: 16 });
    await expect(placeBook(db, me, small.id, 4, (await addBook(db, "Mothwing", "Ada Quill")).workId)).rejects.toThrow(/square/);
    await placeBook(db, me, mid.id, 5, (await addBook(db, "Lantern Harbour", "Bo Ferren")).workId);
  });

  it("validates names, dates and goals", async () => {
    await expect(createChallenge(db, me, { kind: "books", title: " ", target: 5, ...year })).rejects.toThrow(/name/);
    await expect(createChallenge(db, me, { kind: "books", title: "x", target: 0, ...year })).rejects.toThrow(/goal/);
    await expect(createChallenge(db, me, { kind: "books", title: "x", target: 5, startsOn: "2027-05-01", endsOn: "2027-01-01" })).rejects.toThrow(/end after/);
    await expect(createChallenge(db, me, { kind: "bingo", title: "x", card: ["free"], ...year })).rejects.toThrow(/card/);
  });

  it("works out pace and days left", () => {
    expect(expectedByNow(year, 24, "2027-06-30")).toBeCloseTo(12, 0);
    expect(expectedByNow(year, 24, "2026-06-01")).toBe(0);
    expect(expectedByNow(year, 24, "2028-02-01")).toBe(24);
    expect(daysLeft(year, "2027-12-31")).toBe(1);
    expect(daysLeft(year, "2028-01-02")).toBe(0);
  });
});

describe("read the shelf", () => {
  it("counts only books owned before the challenge started", async () => {
    await createChallenge(db, me, { kind: "shelf", title: "Shelf", target: 12, ...year });
    const before = await addBook(db, "Mothwing", "Ada Quill");
    const after = await addBook(db, "Lantern Harbour", "Bo Ferren");
    const c1 = await addCopy(db, me, { editionId: before.editionId });
    const c2 = await addCopy(db, me, { editionId: after.editionId });
    await db.update(copies).set({ createdAt: new Date("2026-06-01") }).where(eq(copies.id, c1.id));
    await db.update(copies).set({ createdAt: new Date("2027-03-01") }).where(eq(copies.id, c2.id));
    await finish(me, before.workId, "2027-04-01");
    await finish(me, after.workId, "2027-04-02");
    expect((await challengesFor(db, me))[0]!.progress.done).toBe(1);
  });
});

describe("joining and leaving", () => {
  it("joins by code, idempotently, and shows members by first name with progress", async () => {
    const c = await createChallenge(db, me, { kind: "books", title: "Duel", target: 10, ...year });
    await joinByCode(db, friend, c.joinCode.toUpperCase());
    await joinByCode(db, friend, c.joinCode);
    const b = await addBook(db, "Mothwing", "Ada Quill");
    await finish(friend, b.workId, "2027-05-05");
    const members = await membersWithProgress(db, c);
    expect(members.map((m) => [m.name, m.progress.done])).toEqual([["Bo", 1], ["Ada", 0]]);
  });

  it("doesn't find unknown codes or other people's private challenges", async () => {
    const c = await createChallenge(db, me, { kind: "books", title: "Private", target: 3, ...year });
    await expect(joinByCode(db, friend, "nope")).rejects.toThrow(/not found/);
    await expect(visibleChallenge(db, friend, c.id)).rejects.toThrow(/not found/);
  });

  it("lets members leave, taking their squares with them, but not the owner", async () => {
    const card = randomCard("classic", 5, seededRng(1));
    const c = await createChallenge(db, me, { kind: "bingo", title: "Bingo", card, theme: "classic", ...year });
    await joinByCode(db, friend, c.joinCode);
    const b = await addBook(db, "Mothwing", "Ada Quill");
    await finish(friend, b.workId, "2027-05-05");
    await placeBook(db, friend, c.id, 0, b.workId);
    await leaveChallenge(db, friend, c.id);
    expect(await db.select().from(bingoSquares)).toEqual([]);
    await expect(leaveChallenge(db, me, c.id)).rejects.toThrow(/Delete it instead/);
  });

  it("only lets the owner delete", async () => {
    const c = await createChallenge(db, me, { kind: "books", title: "Mine", target: 3, ...year });
    await joinByCode(db, friend, c.joinCode);
    await expect(deleteChallenge(db, friend, c.id)).rejects.toThrow(/Only the person/);
    await deleteChallenge(db, me, c.id);
    expect(await db.select().from(challenges)).toEqual([]);
  });
});

describe("bingo", () => {
  const card = [...randomCard("size", 5, seededRng(9))];
  // Make sure the card has a page-count square to test against.
  if (!card.includes("600-pages")) card[0] = "600-pages";
  const long = card.indexOf("600-pages");

  it("suggests squares for finished books, places them and counts lines", async () => {
    const c = await createChallenge(db, me, { kind: "bingo", title: "Chunky", card, theme: "size", ...year });
    const { workId } = await upsertBook(db, book("Mothwing", "Ada Quill", undefined, { edition: { pageCount: 720, binding: "hardcover" } }));
    await finish(me, workId, "2027-03-03");
    const board = await bingoBoard(db, me, c);
    expect(board.finished[0]).toMatchObject({ workId, fits: expect.arrayContaining([long]) });
    await placeBook(db, me, c.id, long, workId);
    const after = await bingoBoard(db, me, c);
    expect(after.placed).toEqual([expect.objectContaining({ square: long, workId, counts: true })]);
    expect(after.finished).toEqual([]);
    expect((await challengesFor(db, me))[0]!.progress).toMatchObject({ done: 1, goal: 24 });
  });

  it("pencils in a book not read yet, and counts it once it's finished in the window", async () => {
    const c = await createChallenge(db, me, { kind: "bingo", title: "B", card, theme: "size", ...year });
    const { workId, editionId } = await upsertBook(db, book("Mothwing", "Ada Quill", undefined, { edition: { pageCount: 720, binding: "hardcover" } }));
    await addCopy(db, me, { editionId });
    // Unread library books are offered for planning, with the squares they'd fit.
    const before = await bingoBoard(db, me, c, "2027-02-01");
    expect(before.planned).toEqual([expect.objectContaining({ workId, fits: expect.arrayContaining([long]) })]);
    await placeBook(db, me, c.id, long, workId);
    let board = await bingoBoard(db, me, c, "2027-02-01");
    expect(board.placed).toEqual([expect.objectContaining({ workId, counts: false })]);
    expect(board.planned).toEqual([]);
    expect((await challengesFor(db, me))[0]!.progress.done).toBe(0);
    await finish(me, workId, "2027-03-03");
    board = await bingoBoard(db, me, c, "2027-03-04");
    expect(board.placed).toEqual([expect.objectContaining({ workId, counts: true })]);
    expect((await challengesFor(db, me))[0]!.progress.done).toBe(1);
  });

  it("doesn't count a book finished outside the window", async () => {
    const c = await createChallenge(db, me, { kind: "bingo", title: "B", card, theme: "size", ...year });
    const early = await addBook(db, "Too Early", "Someone");
    await finish(me, early.workId, "2026-12-30");
    await placeBook(db, me, c.id, 0, early.workId);
    expect((await bingoBoard(db, me, c, "2027-02-01")).placed[0]!.counts).toBe(false);
  });

  it("refuses a second square for one book and the free space", async () => {
    const c = await createChallenge(db, me, { kind: "bingo", title: "B", card, theme: "size", ...year });
    const b = await addBook(db, "Mothwing", "Ada Quill");
    await finish(me, b.workId, "2027-03-03");
    await expect(placeBook(db, me, c.id, 12, b.workId)).rejects.toThrow(/square/);
    await placeBook(db, me, c.id, 1, b.workId);
    await expect(placeBook(db, me, c.id, 2, b.workId)).rejects.toThrow(/already on/);
  });

  it("tells the book page which challenges a book counts toward and where it fits", async () => {
    const goal = await createChallenge(db, me, { kind: "books", title: "24 in 2027", target: 24, ...year });
    const bingo = await createChallenge(db, me, { kind: "bingo", title: "Chunky", card, theme: "size", ...year });
    const { workId } = await upsertBook(db, book("Mothwing", "Ada Quill", undefined, { edition: { pageCount: 720, binding: "hardcover" } }));
    await finish(me, workId, "2027-03-03");
    const notes = await bookInChallenges(db, me, workId, "2027-03-04");
    expect(notes).toContainEqual({ kind: "counts", challengeId: goal.id, title: "24 in 2027" });
    expect(notes).toContainEqual(expect.objectContaining({ kind: "bingo", challengeId: bingo.id, finished: true, squares: expect.arrayContaining([{ square: long, label: "More than 600 pages" }]) }));
    // An unread book that fits nothing by its details isn't mentioned.
    expect(await bookInChallenges(db, me, (await addBook(db, "Small Brown Lamps", "X")).workId, "2027-03-04")).toEqual([]);
  });

  it("offers to pencil in an unread book for squares it would fit", async () => {
    const bingo = await createChallenge(db, me, { kind: "bingo", title: "Chunky", card, theme: "size", ...year });
    const { workId } = await upsertBook(db, book("Doorstop", "Ada Quill", undefined, { edition: { pageCount: 950, binding: "hardcover" } }));
    const notes = await bookInChallenges(db, me, workId, "2027-03-04");
    expect(notes).toEqual([expect.objectContaining({ kind: "bingo", challengeId: bingo.id, finished: false, squares: expect.arrayContaining([{ square: long, label: "More than 600 pages" }]) })]);
  });
});

describe("featured challenges", () => {
  it("are created once per year, with next year's from November", async () => {
    await ensureFeaturedChallenges(db, "2027-06-01");
    await ensureFeaturedChallenges(db, "2027-06-02");
    expect((await db.select().from(challenges)).map((c) => c.featuredSlug).sort()).toEqual(["bingo-2027", "books-2027", "shelf-2027"]);
    await ensureFeaturedChallenges(db, "2027-11-01");
    expect(await db.$count(challenges)).toBe(6);
    const bingo = (await db.select().from(challenges)).find((c) => c.featuredSlug === "bingo-2028")!;
    // Seeded by year, so the card is the same everywhere and on every boot.
    expect(bingo.card).toEqual(randomCard("classic", 5, seededRng(2028)));
  });

  it("can be joined by anyone and show who's in", async () => {
    await ensureFeaturedChallenges(db, "2027-06-01");
    const [first] = await featuredFor(db, friend, "2027-06-01");
    expect(first!.joined).toBe(false);
    await joinFeatured(db, friend, first!.id);
    expect((await featuredFor(db, friend, "2027-06-01")).find((c) => c.id === first!.id)).toMatchObject({ joined: true, members: 1 });
    expect((await visibleChallenge(db, me, first!.id)).member).toBe(false);
  });
});
