import { and, desc, eq } from "drizzle-orm";
import type { DbLike } from "@/db";
import { readingStatus, readThroughs, works, type ReadingStatus } from "@/db/schema";
import { invalid, notFound } from "./errors";
import { latestAllowedDate, requireDate, todayUtc, type IsoDate } from "./dates";

type ReadThrough = typeof readThroughs.$inferSelect;

const MAX_REVIEW = 20_000;

async function assertWork(db: DbLike, workId: string) {
  const w = await db.query.works.findFirst({ where: eq(works.id, workId), columns: { id: true } });
  if (!w) throw notFound("Book");
}

export async function getStatus(db: DbLike, userId: string, workId: string): Promise<ReadingStatus | null> {
  const row = await db.query.readingStatus.findFirst({
    where: and(eq(readingStatus.userId, userId), eq(readingStatus.workId, workId)),
  });
  return row?.status ?? null;
}

async function writeStatus(db: DbLike, userId: string, workId: string, status: ReadingStatus | null) {
  if (status === null) {
    await db.delete(readingStatus).where(and(eq(readingStatus.userId, userId), eq(readingStatus.workId, workId)));
    return;
  }
  await db
    .insert(readingStatus)
    .values({ userId, workId, status })
    .onConflictDoUpdate({ target: [readingStatus.userId, readingStatus.workId], set: { status, updatedAt: new Date() } });
}

async function openReadThrough(db: DbLike, userId: string, workId: string) {
  return db.query.readThroughs.findFirst({
    where: and(eq(readThroughs.userId, userId), eq(readThroughs.workId, workId), eq(readThroughs.outcome, "in_progress")),
    orderBy: [desc(readThroughs.createdAt)],
  });
}

function checkedDate(raw: string | null | undefined, field: string, now: Date): IsoDate | null {
  const d = requireDate(raw, field);
  if (d && d > latestAllowedDate(now)) throw invalid(`${field} can't be in the future`);
  return d;
}

export type SetStatusOptions = {
  /** Start date for "reading", finish date for "read"/"dnf". Defaults to today. */
  date?: string | null;
  /** For "read": the user doesn't remember when — record the read without a date. */
  dateUnknown?: boolean;
  editionId?: string | null;
  now?: Date;
};

/**
 * Moves a book to a reading status and keeps read-throughs consistent:
 * starting opens a read-through, finishing or abandoning closes the open one
 * (or records a new one), and pausing never loses the start date.
 */
export async function setStatus(
  db: DbLike,
  userId: string,
  workId: string,
  status: ReadingStatus,
  opts: SetStatusOptions = {},
) {
  await assertWork(db, workId);
  const now = opts.now ?? new Date();
  const current = await getStatus(db, userId, workId);
  if (current === status) return;

  const open = await openReadThrough(db, userId, workId);
  const date = opts.dateUnknown ? null : (checkedDate(opts.date, "Date", now) ?? todayUtc(now));

  switch (status) {
    case "want_to_read":
      if (open) await db.delete(readThroughs).where(eq(readThroughs.id, open.id));
      break;
    case "reading":
      if (!open) {
        await db.insert(readThroughs).values({
          userId,
          workId,
          editionId: opts.editionId ?? null,
          outcome: "in_progress",
          startedAt: date,
        });
      }
      break;
    case "paused":
      if (!open) {
        await db.insert(readThroughs).values({ userId, workId, editionId: opts.editionId ?? null, outcome: "in_progress" });
      }
      break;
    case "read":
    case "dnf": {
      const outcome = status === "read" ? "finished" : "dnf";
      if (open) {
        if (date && open.startedAt && date < open.startedAt) {
          throw invalid("The finish date can't be before you started");
        }
        await db.update(readThroughs).set({ outcome, finishedAt: date }).where(eq(readThroughs.id, open.id));
      } else {
        await db.insert(readThroughs).values({
          userId,
          workId,
          editionId: opts.editionId ?? null,
          outcome,
          finishedAt: date,
        });
      }
      break;
    }
  }
  await writeStatus(db, userId, workId, status);
}

/** Starts a fresh read of a book that's already been read or abandoned. Earlier reads stay in history. */
export async function startReread(db: DbLike, userId: string, workId: string, opts: { date?: string | null; now?: Date } = {}) {
  const current = await getStatus(db, userId, workId);
  if (current !== "read" && current !== "dnf") throw invalid("Only finished or abandoned books can be started again");
  const now = opts.now ?? new Date();
  await db.insert(readThroughs).values({
    userId,
    workId,
    outcome: "in_progress",
    startedAt: checkedDate(opts.date, "Start date", now) ?? todayUtc(now),
  });
  await writeStatus(db, userId, workId, "reading");
}

/** Stops tracking a book's reading status. Finished reads stay as history; an unfinished one is dropped. */
export async function clearStatus(db: DbLike, userId: string, workId: string) {
  const open = await openReadThrough(db, userId, workId);
  if (open) await db.delete(readThroughs).where(eq(readThroughs.id, open.id));
  await writeStatus(db, userId, workId, null);
}

async function getOwnedReadThrough(db: DbLike, userId: string, id: string): Promise<ReadThrough> {
  const rt = await db.query.readThroughs.findFirst({ where: and(eq(readThroughs.id, id), eq(readThroughs.userId, userId)) });
  if (!rt) throw notFound("Read");
  return rt;
}

export function validRating(rating: number | null | undefined): number | null {
  if (rating === null || rating === undefined) return null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) throw invalid("Ratings go from ½ to 5 stars");
  return rating;
}

export async function updateReadThrough(
  db: DbLike,
  userId: string,
  id: string,
  patch: { startedAt?: string | null; finishedAt?: string | null; rating?: number | null; review?: string | null },
  now = new Date(),
) {
  const rt = await getOwnedReadThrough(db, userId, id);
  const startedAt = patch.startedAt !== undefined ? checkedDate(patch.startedAt, "Start date", now) : rt.startedAt;
  const finishedAt = patch.finishedAt !== undefined ? checkedDate(patch.finishedAt, "Finish date", now) : rt.finishedAt;
  if (rt.outcome === "in_progress" && finishedAt) throw invalid("Mark the book as read to set a finish date");
  if (startedAt && finishedAt && finishedAt < startedAt) throw invalid("The finish date can't be before you started");

  const set: Partial<typeof readThroughs.$inferInsert> = { startedAt, finishedAt };
  if (patch.rating !== undefined) {
    if (rt.outcome === "in_progress" && patch.rating !== null) throw invalid("Rate the book once you've finished or stopped");
    set.rating = validRating(patch.rating);
  }
  if (patch.review !== undefined) {
    const review = patch.review?.trim() || null;
    if (review && review.length > MAX_REVIEW) throw invalid("That review is too long");
    set.review = review;
  }
  const [row] = await db.update(readThroughs).set(set).where(eq(readThroughs.id, id)).returning();
  return row!;
}

const statusForOutcome: Record<ReadThrough["outcome"], ReadingStatus> = {
  in_progress: "reading",
  finished: "read",
  dnf: "dnf",
};

/** Deletes a read and re-derives the status from what's left, so the two never disagree. */
export async function deleteReadThrough(db: DbLike, userId: string, id: string) {
  const rt = await getOwnedReadThrough(db, userId, id);
  await db.delete(readThroughs).where(eq(readThroughs.id, id));
  const current = await getStatus(db, userId, rt.workId);
  if (current === "want_to_read") return;

  const remaining = await db.query.readThroughs.findMany({
    where: and(eq(readThroughs.userId, userId), eq(readThroughs.workId, rt.workId)),
  });
  if (remaining.length === 0) {
    await writeStatus(db, userId, rt.workId, null);
    return;
  }
  const open = remaining.find((r) => r.outcome === "in_progress");
  if (open) {
    await writeStatus(db, userId, rt.workId, current === "paused" ? "paused" : "reading");
    return;
  }
  const latest = [...remaining].sort((a, b) =>
    (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "") || b.createdAt.getTime() - a.createdAt.getTime(),
  )[0]!;
  await writeStatus(db, userId, rt.workId, statusForOutcome[latest.outcome]);
}

export async function readThroughsFor(db: DbLike, userId: string, workId: string) {
  return db.query.readThroughs.findMany({
    where: and(eq(readThroughs.userId, userId), eq(readThroughs.workId, workId)),
    orderBy: [desc(readThroughs.createdAt)],
  });
}
