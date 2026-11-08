import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { modelUsage } from "@/db/schema";
import { SpineReaderError, type SpineReader } from "@/sources/spine-reader";
import { makeUser, testDb, type TestDb } from "@/test/db";
import type { CatalogueSource } from "./catalogue";
import { createSnapSession, processSnap } from "./snap";
import {
  assertCanSnap,
  assertDailyBudget,
  costMicros,
  dailyBudgetFromEnv,
  recordUsage,
  snapAllowance,
  snapLimitFromEnv,
  spendSince,
  spentToday,
  startOfMonthUtc,
} from "./usage";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

const opusRead = { model: "claude-opus-5-5", inputTokens: 5594, outputTokens: 1084 };
const noCatalogue: CatalogueSource = { lookupIsbn: async () => null, search: async () => [], searchByTitle: async () => [] };

describe("costMicros", () => {
  it("prices the measured Opus shelf read at about 4.4 cents", () => {
    expect(costMicros(opusRead)).toBe(44056);
  });
  it("prices unknown models as the most expensive, never as free", () => {
    expect(costMicros({ ...opusRead, model: "claude-something-new" })).toBe(44056);
    expect(costMicros({ ...opusRead, model: "claude-haiku-5-5" })).toBe(1101);
  });
});

describe("snap allowance", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("counts this calendar month's reads for this user only", async () => {
    const other = await makeUser(db, "Other");
    await recordUsage(db, me, null, opusRead);
    await recordUsage(db, me, null, opusRead);
    await recordUsage(db, other, null, opusRead);
    await db.insert(modelUsage).values({ userId: me, purpose: "spine_read", ...opusRead, costMicros: 1, createdAt: new Date("2026-10-31T23:59:59Z") });
    expect(await snapAllowance(db, me, 10, now)).toEqual({ used: 2, limit: 10, remaining: 8, resetsAt: new Date("2026-12-01T00:00:00Z") });
  });

  it("blocks at the limit with a reset date and a way forward", async () => {
    for (let i = 0; i < 3; i++) await recordUsage(db, me, null, opusRead);
    await expect(assertCanSnap(db, me, 3, now)).rejects.toMatchObject({ code: "limit_reached", message: expect.stringMatching(/1 December.*search or barcode/) });
    await assertCanSnap(db, me, 4, now);
  });

  it("treats a null limit as unlimited", async () => {
    for (let i = 0; i < 50; i++) await recordUsage(db, me, null, opusRead);
    expect((await assertCanSnap(db, me, null, now)).remaining).toBeNull();
  });

  it("rolls over correctly at year end", () => {
    expect(startOfMonthUtc(new Date("2026-12-31T23:00:00Z"))).toEqual(new Date("2026-12-01T00:00:00Z"));
  });
});

describe("recording from snaps", () => {
  const reader = (usage: { model: string; inputTokens: number; outputTokens: number } | null): SpineReader => ({
    name: "fake",
    read: async () => ({ spines: [], isShelf: true, usage }),
  });

  it("records each model read against the session, including retries", async () => {
    const session = await createSnapSession(db, me, { imagePath: "x", locationId: null });
    await processSnap(db, reader(opusRead), noCatalogue, me, session.id, new Uint8Array());
    const rows = await db.query.modelUsage.findMany();
    expect(rows).toEqual([expect.objectContaining({ userId: me, sessionId: session.id, costMicros: 44056 })]);
  });

  it("counts a failed read that was still billed", async () => {
    const failing: SpineReader = { name: "fake", read: async () => Promise.reject(new SpineReaderError("Too many books", opusRead)) };
    const session = await createSnapSession(db, me, { imagePath: "x", locationId: null });
    expect((await processSnap(db, failing, noCatalogue, me, session.id, new Uint8Array())).status).toBe("failed");
    expect((await snapAllowance(db, me, 10)).used).toBe(1);
  });

  it("doesn't count demo or fixture reads", async () => {
    const session = await createSnapSession(db, me, { imagePath: "x", locationId: null });
    await processSnap(db, reader(null), noCatalogue, me, session.id, new Uint8Array());
    expect((await snapAllowance(db, me, 10)).used).toBe(0);
  });

  it("reports spend per user, most expensive first", async () => {
    const other = await makeUser(db, "Other");
    await recordUsage(db, me, null, opusRead);
    await recordUsage(db, other, null, opusRead);
    await recordUsage(db, other, null, opusRead);
    const report = await spendSince(db, new Date(0));
    expect(report.map((r) => [r.userId, r.reads, Number(r.costMicros)])).toEqual([
      [other, 2, 88112],
      [me, 1, 44056],
    ]);
  });
});

it("snapLimitFromEnv defaults to 10 and accepts unlimited", () => {
  expect(snapLimitFromEnv(undefined)).toBe(10);
  expect(snapLimitFromEnv("25")).toBe(25);
  expect(snapLimitFromEnv("0")).toBe(0);
  expect(snapLimitFromEnv("Unlimited")).toBeNull();
  expect(snapLimitFromEnv("nonsense")).toBe(10);
});

describe("daily budget", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const at = async (userId: string, when: Date) => {
    await recordUsage(db, userId, null, opusRead);
    const rows = await db.query.modelUsage.findMany();
    await db.update(modelUsage).set({ createdAt: when }).where(eq(modelUsage.id, rows.at(-1)!.id));
  };

  it("adds up today's reads across every reader, from midnight UTC", async () => {
    const other = await makeUser(db, "Other");
    await at(me, new Date("2026-11-08T00:00:00Z"));
    await at(other, new Date("2026-11-08T11:59:00Z"));
    await at(me, new Date("2026-11-07T23:59:59Z"));
    expect(await spentToday(db, now)).toBe(2 * 44056);
  });

  it("pauses snaps for everyone once the day's budget is spent", async () => {
    await at(me, now);
    await expect(assertDailyBudget(db, 44057, now)).resolves.toBeUndefined();
    await expect(assertDailyBudget(db, 44056, now)).rejects.toMatchObject({ code: "limit_reached" });
    await expect(assertDailyBudget(db, null, now)).resolves.toBeUndefined();
  });

  it("reads the budget in dollars, defaulting to $3", () => {
    expect(dailyBudgetFromEnv(undefined)).toBe(3_000_000);
    expect(dailyBudgetFromEnv("0.5")).toBe(500_000);
    expect(dailyBudgetFromEnv("unlimited")).toBeNull();
    expect(dailyBudgetFromEnv("nonsense")).toBe(3_000_000);
  });
});
