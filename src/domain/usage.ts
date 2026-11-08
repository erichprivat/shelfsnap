import { and, count, eq, gte, sql } from "drizzle-orm";
import type { DbLike } from "@/db";
import { modelUsage } from "@/db/schema";
import { DomainError } from "./errors";

/** List prices in USD per million tokens. Unknown models are priced as the most expensive, so spend is never under-reported. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const FALLBACK_PRICE = PRICES["claude-opus-5-5"]!;

export type TokenUsage = { model: string; inputTokens: number; outputTokens: number };

export function costMicros(u: TokenUsage): number {
  const price = PRICES[u.model] ?? FALLBACK_PRICE;
  return Math.round(u.inputTokens * price.input + u.outputTokens * price.output);
}

export async function recordUsage(db: DbLike, userId: string, sessionId: string | null, u: TokenUsage) {
  await db.insert(modelUsage).values({ userId, sessionId, purpose: "spine_read", ...u, costMicros: costMicros(u) });
}

export function startOfMonthUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type SnapAllowance = { used: number; limit: number | null; remaining: number | null; resetsAt: Date };

/** `limit` null means unlimited. Only reads that called a model count; demo and fixture reads are free. */
export async function snapAllowance(db: DbLike, userId: string, limit: number | null, now = new Date()): Promise<SnapAllowance> {
  const since = startOfMonthUtc(now);
  const [row] = await db
    .select({ n: count() })
    .from(modelUsage)
    .where(and(eq(modelUsage.userId, userId), eq(modelUsage.purpose, "spine_read"), gte(modelUsage.createdAt, since)));
  const used = row?.n ?? 0;
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used), resetsAt };
}

export async function assertCanSnap(db: DbLike, userId: string, limit: number | null, now = new Date()) {
  const a = await snapAllowance(db, userId, limit, now);
  if (a.remaining === 0) {
    const when = a.resetsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    throw new DomainError("limit_reached", `You've used this month's ${a.limit === 1 ? "free shelf snap" : `${a.limit} free shelf snaps`}. They reset on ${when} — until then, add books by search or barcode.`);
  }
  return a;
}

export function startOfDayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** What every reader together has spent on model reads since midnight UTC, in micro-dollars. */
export async function spentToday(db: DbLike, now = new Date()) {
  const [row] = await db
    .select({ micros: sql<number | null>`sum(${modelUsage.costMicros})` })
    .from(modelUsage)
    .where(gte(modelUsage.createdAt, startOfDayUtc(now)));
  return row?.micros ?? 0;
}

/** A ceiling across all accounts, so a burst of sign-ups can't run up the bill. `budgetMicros` null means no ceiling. */
export async function assertDailyBudget(db: DbLike, budgetMicros: number | null, now = new Date()) {
  if (budgetMicros === null) return;
  if ((await spentToday(db, now)) >= budgetMicros) {
    throw new DomainError("limit_reached", "Shelf snaps are paused for the rest of the day. Try again tomorrow — until then, add books by search or barcode.");
  }
}

/** Monthly spend per user, most expensive first. */
export async function spendSince(db: DbLike, since: Date) {
  return db
    .select({ userId: modelUsage.userId, reads: count(), costMicros: sql<number>`sum(${modelUsage.costMicros})` })
    .from(modelUsage)
    .where(gte(modelUsage.createdAt, since))
    .groupBy(modelUsage.userId)
    .orderBy(sql`sum(${modelUsage.costMicros}) desc`);
}

/** SNAP_MONTHLY_LIMIT: a number, or "unlimited". Defaults to 10. */
export function snapLimitFromEnv(raw = process.env.SNAP_MONTHLY_LIMIT): number | null {
  if (raw?.trim().toLowerCase() === "unlimited") return null;
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

/** SNAP_DAILY_BUDGET_USD: dollars across all readers per UTC day, or "unlimited". Defaults to $3. Returns micro-dollars. */
export function dailyBudgetFromEnv(raw = process.env.SNAP_DAILY_BUDGET_USD): number | null {
  if (raw?.trim().toLowerCase() === "unlimited") return null;
  const n = Number.parseFloat(raw ?? "");
  return Math.round((Number.isFinite(n) && n >= 0 ? n : 3) * 1_000_000);
}
