import { desc, eq } from "drizzle-orm";
import type { DbLike } from "@/db";
import { copies, feedback, importRecords, modelUsage, readingStatus, session, snapSessions, user } from "@/db/schema";

/** The spec's activation bar: this many books in the library by the end of the first day. */
export const ACTIVATION_BOOKS = 50;
const FIRST_DAY_MS = 24 * 3_600_000;

export type ReaderStats = {
  email: string;
  joinedAt: Date;
  lastSeenAt: Date | null;
  booksFirstDay: number;
  books: number;
  snaps: number;
  imported: number;
  feedback: number;
  activated: boolean;
};

const groupBy = <T>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
};

/** One row per reader: how far they got on day one and what they have done since. Newest readers first. */
export async function readerStats(db: DbLike): Promise<ReaderStats[]> {
  const users = await db.select({ id: user.id, email: user.email, createdAt: user.createdAt }).from(user).orderBy(desc(user.createdAt));
  const added = [
    ...(await db.select({ userId: copies.userId, ref: copies.editionId, at: copies.createdAt }).from(copies)).map((r) => ({ ...r, kind: "edition" })),
    ...(await db.select({ userId: readingStatus.userId, ref: readingStatus.workId, at: readingStatus.updatedAt }).from(readingStatus)).map((r) => ({ ...r, kind: "work" })),
    ...(await db.select({ userId: importRecords.userId, ref: importRecords.workId, at: importRecords.importedAt }).from(importRecords)).map((r) => ({ ...r, kind: "import" })),
  ];
  const editionWork = new Map(
    (await db.query.editions.findMany({ columns: { id: true, workId: true } })).map((e) => [e.id, e.workId] as const),
  );
  const byUser = groupBy(added, (r) => r.userId);
  const snaps = groupBy(await db.select({ userId: snapSessions.userId }).from(snapSessions), (r) => r.userId);
  const imports = groupBy(await db.select({ userId: importRecords.userId }).from(importRecords), (r) => r.userId);
  const notes = groupBy(await db.select({ userId: feedback.userId, at: feedback.createdAt }).from(feedback), (r) => r.userId);
  const seen = groupBy(await db.select({ userId: session.userId, at: session.updatedAt }).from(session), (r) => r.userId);
  const reads = groupBy(await db.select({ userId: modelUsage.userId, at: modelUsage.createdAt }).from(modelUsage), (r) => r.userId);

  return users.map((u) => {
    const rows = byUser.get(u.id) ?? [];
    const work = (r: (typeof rows)[number]) => (r.kind === "edition" ? (editionWork.get(r.ref) ?? r.ref) : r.ref);
    const firstDayEnd = u.createdAt.getTime() + FIRST_DAY_MS;
    const booksFirstDay = new Set(rows.filter((r) => r.at.getTime() <= firstDayEnd).map(work)).size;
    const activity = [...(seen.get(u.id) ?? []), ...(reads.get(u.id) ?? []), ...(notes.get(u.id) ?? []), ...rows].map((r) => r.at.getTime());
    return {
      email: u.email,
      joinedAt: u.createdAt,
      lastSeenAt: activity.length ? new Date(Math.max(...activity)) : null,
      booksFirstDay,
      // Import records outlive books removed later; only copies and statuses are the library today.
      books: new Set(rows.filter((r) => r.kind !== "import").map(work)).size,
      snaps: snaps.get(u.id)?.length ?? 0,
      imported: imports.get(u.id)?.length ?? 0,
      feedback: notes.get(u.id)?.length ?? 0,
      activated: booksFirstDay >= ACTIVATION_BOOKS,
    };
  });
}

export async function recentFeedback(db: DbLike, limit = 20) {
  return db
    .select({ message: feedback.message, page: feedback.page, createdAt: feedback.createdAt, email: user.email })
    .from(feedback)
    .innerJoin(user, eq(feedback.userId, user.id))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
}
