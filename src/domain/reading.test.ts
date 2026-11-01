import { beforeEach, describe, expect, it } from "vitest";
import { addBook, makeUser, testDb, type TestDb } from "@/test/db";
import { clearStatus, deleteReadThrough, getStatus, readThroughsFor, setStatus, startReread, updateReadThrough } from "./reading";

let db: TestDb;
let me: string;
let work: string;
const now = new Date("2026-06-15T12:00:00Z");
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
  work = (await addBook(db, "Stoner", "John Williams")).workId;
});

describe("setStatus", () => {
  it("opens a read on start and closes it on finish", async () => {
    await setStatus(db, me, work, "reading", { date: "2026-06-01", now });
    await setStatus(db, me, work, "read", { date: "2026-06-10", now });
    const [rt, ...rest] = await readThroughsFor(db, me, work);
    expect(rest).toHaveLength(0);
    expect(rt).toMatchObject({ outcome: "finished", startedAt: "2026-06-01", finishedAt: "2026-06-10" });
  });

  it("pausing and resuming keeps the original start date", async () => {
    await setStatus(db, me, work, "reading", { date: "2026-06-01", now });
    await setStatus(db, me, work, "paused", { now });
    await setStatus(db, me, work, "reading", { date: "2026-06-12", now });
    const rts = await readThroughsFor(db, me, work);
    expect(rts).toHaveLength(1);
    expect(rts[0]!.startedAt).toBe("2026-06-01");
    expect(await getStatus(db, me, work)).toBe("reading");
  });

  it("records an undated read when the user doesn't remember", async () => {
    await setStatus(db, me, work, "read", { dateUnknown: true, now });
    expect((await readThroughsFor(db, me, work))[0]).toMatchObject({ outcome: "finished", finishedAt: null });
  });

  it("abandoning closes the open read as DNF", async () => {
    await setStatus(db, me, work, "reading", { now });
    await setStatus(db, me, work, "dnf", { now });
    expect((await readThroughsFor(db, me, work))[0]!.outcome).toBe("dnf");
  });

  it("going back to want-to-read drops an unfinished read but keeps finished ones", async () => {
    await setStatus(db, me, work, "read", { date: "2026-01-01", now });
    await startReread(db, me, work, { now });
    await setStatus(db, me, work, "want_to_read", { now });
    const rts = await readThroughsFor(db, me, work);
    expect(rts.map((r) => r.outcome)).toEqual(["finished"]);
  });

  it("setting the same status twice is a no-op", async () => {
    await setStatus(db, me, work, "read", { now });
    await setStatus(db, me, work, "read", { now });
    expect(await readThroughsFor(db, me, work)).toHaveLength(1);
  });

  it("rejects a finish date before the start", async () => {
    await setStatus(db, me, work, "reading", { date: "2026-06-10", now });
    await expect(setStatus(db, me, work, "read", { date: "2026-06-01", now })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await getStatus(db, me, work)).toBe("reading");
  });

  it("rejects future dates but allows today in any timezone", async () => {
    await expect(setStatus(db, me, work, "reading", { date: "2026-06-20", now })).rejects.toMatchObject({ code: "invalid_input" });
    await setStatus(db, me, work, "reading", { date: "2026-06-16", now });
  });

  it("fails cleanly for an unknown book", async () => {
    await expect(setStatus(db, me, "nope", "read", { now })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("rereads", () => {
  it("adds a new read and keeps history", async () => {
    await setStatus(db, me, work, "read", { date: "2025-01-01", now });
    await startReread(db, me, work, { now });
    await setStatus(db, me, work, "read", { now });
    expect((await readThroughsFor(db, me, work)).map((r) => r.outcome)).toEqual(["finished", "finished"]);
  });
  it("is only offered for finished or abandoned books", async () => {
    await expect(startReread(db, me, work, { now })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("updateReadThrough", () => {
  it("validates ratings", async () => {
    await setStatus(db, me, work, "read", { now });
    const [rt] = await readThroughsFor(db, me, work);
    expect((await updateReadThrough(db, me, rt!.id, { rating: 9 }, now)).rating).toBe(9);
    for (const bad of [0, 11, 3.5]) {
      await expect(updateReadThrough(db, me, rt!.id, { rating: bad }, now)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect((await updateReadThrough(db, me, rt!.id, { rating: null }, now)).rating).toBeNull();
  });
  it("doesn't rate or finish a read in progress", async () => {
    await setStatus(db, me, work, "reading", { now });
    const [rt] = await readThroughsFor(db, me, work);
    await expect(updateReadThrough(db, me, rt!.id, { rating: 8 }, now)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(updateReadThrough(db, me, rt!.id, { finishedAt: "2026-06-01" }, now)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("keeps date order when editing one side", async () => {
    await setStatus(db, me, work, "reading", { date: "2026-06-01", now });
    await setStatus(db, me, work, "read", { date: "2026-06-10", now });
    const [rt] = await readThroughsFor(db, me, work);
    await expect(updateReadThrough(db, me, rt!.id, { startedAt: "2026-06-11" }, now)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("trims reviews and treats blank as none", async () => {
    await setStatus(db, me, work, "read", { now });
    const [rt] = await readThroughsFor(db, me, work);
    expect((await updateReadThrough(db, me, rt!.id, { review: "   " }, now)).review).toBeNull();
  });
  it("is scoped to the owner", async () => {
    await setStatus(db, me, work, "read", { now });
    const [rt] = await readThroughsFor(db, me, work);
    const other = await makeUser(db, "Other");
    await expect(updateReadThrough(db, other, rt!.id, { rating: 2 }, now)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleteReadThrough", () => {
  it("re-derives the status from what's left", async () => {
    await setStatus(db, me, work, "read", { date: "2025-01-01", now });
    await startReread(db, me, work, { now });
    const open = (await readThroughsFor(db, me, work)).find((r) => r.outcome === "in_progress")!;
    await deleteReadThrough(db, me, open.id);
    expect(await getStatus(db, me, work)).toBe("read");
    const last = (await readThroughsFor(db, me, work))[0]!;
    await deleteReadThrough(db, me, last.id);
    expect(await getStatus(db, me, work)).toBeNull();
  });
  it("keeps want-to-read when deleting old history", async () => {
    await setStatus(db, me, work, "read", { now });
    await setStatus(db, me, work, "want_to_read", { now });
    const [rt] = await readThroughsFor(db, me, work);
    await deleteReadThrough(db, me, rt!.id);
    expect(await getStatus(db, me, work)).toBe("want_to_read");
  });
});

it("clearStatus drops the open read and keeps finished history", async () => {
  await setStatus(db, me, work, "read", { now });
  await startReread(db, me, work, { now });
  await clearStatus(db, me, work);
  expect(await getStatus(db, me, work)).toBeNull();
  expect((await readThroughsFor(db, me, work)).map((r) => r.outcome)).toEqual(["finished"]);
});
