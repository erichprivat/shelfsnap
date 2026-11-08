import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { copies, snapSessions, user } from "@/db/schema";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { addCopy } from "./copies";
import { submitFeedback } from "./feedback";
import { setStatus } from "./reading";
import { ACTIVATION_BOOKS, readerStats, recentFeedback } from "./stats";

let db: TestDb;
beforeEach(async () => {
  db = await testDb();
});

const joined = new Date("2026-11-01T10:00:00Z");
const hours = (h: number) => new Date(joined.getTime() + h * 3_600_000);

async function reader(name: string) {
  const id = await makeUser(db, name);
  await db.update(user).set({ createdAt: joined }).where(eq(user.id, id));
  return id;
}

describe("readerStats", () => {
  it("counts distinct books from day one separately from later", async () => {
    const me = await reader("Me");
    const dune = await addBook(db, "Dune", "Herbert");
    const late = await addBook(db, "Later", "X");
    const copy = await addCopy(db, me, { editionId: dune.editionId });
    await db.update(copies).set({ createdAt: hours(2) }).where(eq(copies.id, copy.id));
    await setStatus(db, me, dune.workId, "read", { now: hours(3) });
    const lateCopy = await addCopy(db, me, { editionId: late.editionId });
    await db.update(copies).set({ createdAt: hours(30) }).where(eq(copies.id, lateCopy.id));
    await db.insert(snapSessions).values({ userId: me, imagePath: "x.jpg", status: "ready" });
    await submitFeedback(db, me, { message: "Nice" });

    const [s] = await readerStats(db);
    expect(s).toMatchObject({ booksFirstDay: 1, books: 2, snaps: 1, feedback: 1, activated: false });
  });

  it(`marks a reader activated at ${ACTIVATION_BOOKS} books on day one`, async () => {
    const me = await reader("Me");
    for (let i = 0; i < ACTIVATION_BOOKS; i++) {
      const b = await addBook(db, `Book ${i}`, "X");
      const c = await addCopy(db, me, { editionId: b.editionId });
      await db.update(copies).set({ createdAt: hours(1) }).where(eq(copies.id, c.id));
    }
    expect((await readerStats(db))[0]).toMatchObject({ booksFirstDay: ACTIVATION_BOOKS, activated: true });
  });

  it("lists readers with nothing yet", async () => {
    await reader("Empty");
    expect(await readerStats(db)).toEqual([expect.objectContaining({ books: 0, booksFirstDay: 0, lastSeenAt: null, activated: false })]);
  });
});

describe("recentFeedback", () => {
  it("returns the newest messages with the sender", async () => {
    const me = await reader("Me");
    await submitFeedback(db, me, { message: "First" }, hours(1));
    await submitFeedback(db, me, { message: "Second" }, hours(2));
    expect((await recentFeedback(db)).map((f) => f.message)).toEqual(["Second", "First"]);
  });
});
