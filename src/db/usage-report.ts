import { inArray } from "drizzle-orm";
import { db } from ".";
import { user } from "./schema";
import { spendSince, startOfMonthUtc } from "@/domain/usage";

/** Usage: bun run usage [YYYY-MM] — spine-reading spend per user for a month (default: this month). */
const arg = process.argv[2];
const since = arg ? new Date(`${arg}-01T00:00:00Z`) : startOfMonthUtc(new Date());
const rows = await spendSince(db, since);
const users = rows.length ? await db.query.user.findMany({ where: inArray(user.id, rows.map((r) => r.userId)), columns: { id: true, email: true } }) : [];
const email = new Map(users.map((u) => [u.id, u.email]));
const usd = (micros: number) => `$${(micros / 1e6).toFixed(3)}`;
let total = 0;
let reads = 0;
for (const r of rows) {
  total += Number(r.costMicros);
  reads += r.reads;
  console.log(`${usd(Number(r.costMicros)).padStart(9)}  ${String(r.reads).padStart(4)} snaps  ${email.get(r.userId) ?? r.userId}`);
}
console.log(`${usd(total).padStart(9)}  ${String(reads).padStart(4)} snaps  total since ${since.toISOString().slice(0, 10)}${reads ? ` · ${usd(total / reads)} per snap` : ""}`);
