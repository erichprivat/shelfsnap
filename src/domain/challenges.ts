import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { DbLike } from "@/db";
import {
  bingoSquares,
  challengeMembers,
  challenges,
  copies,
  editions,
  readingStatus,
  readThroughs,
  user,
  works,
  type ChallengeKind,
} from "@/db/schema";
import {
  category,
  cardSize,
  completedLines,
  freeSquare,
  squaresToFill,
  fittingSquares,
  isValidCard,
  randomCard,
  seededRng,
  theme as themeById,
  type BookFacts,
  type ThemeId,
} from "./bingo-categories";
import { parseDate, todayUtc } from "./dates";
import { conflict, DomainError, invalid, notFound } from "./errors";

export type Challenge = typeof challenges.$inferSelect;

const MAX_TITLE = 80;
const MAX_TARGET = 1000;

// ─── Creating, joining, leaving ──────────────────────────────────────────────

/** Unambiguous characters only: easy to read aloud or type from a screenshot. */
function newJoinCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export type NewChallenge = {
  kind: ChallengeKind;
  title: string;
  startsOn: string;
  endsOn: string;
  target?: number | null;
  card?: string[] | null;
  theme?: string | null;
};

function validated(input: NewChallenge) {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) throw invalid("Give the challenge a name");
  if (title.length > MAX_TITLE) throw invalid(`Keep the name under ${MAX_TITLE} characters`);
  const startsOn = parseDate(input.startsOn);
  const endsOn = parseDate(input.endsOn);
  if (!startsOn || !endsOn) throw invalid("Pick when the challenge starts and ends");
  if (endsOn < startsOn) throw invalid("The challenge has to end after it starts");
  if (input.kind === "bingo") {
    if (!isValidCard(input.card)) throw invalid("That bingo card isn't complete");
    return { kind: input.kind, title, startsOn, endsOn, target: null, card: input.card, theme: themeById(input.theme).id };
  }
  const target = Number(input.target);
  if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET) throw invalid(`Pick a goal between 1 and ${MAX_TARGET} books`);
  return { kind: input.kind, title, startsOn, endsOn, target, card: null, theme: null };
}

/** Creates a challenge and makes its creator the first member. */
export async function createChallenge(db: DbLike, userId: string, input: NewChallenge): Promise<Challenge> {
  const [row] = await db
    .insert(challenges)
    .values({ ...validated(input), ownerId: userId, joinCode: newJoinCode() })
    .returning();
  await db.insert(challengeMembers).values({ challengeId: row!.id, userId });
  return row!;
}

export async function challengeByCode(db: DbLike, code: string) {
  const c = await db.query.challenges.findFirst({ where: eq(challenges.joinCode, code.trim().toLowerCase()) });
  if (!c) throw notFound("Challenge");
  return c;
}

/** Joining twice is fine: it just lands you in the challenge again. */
export async function joinByCode(db: DbLike, userId: string, code: string): Promise<Challenge> {
  const c = await challengeByCode(db, code);
  await db.insert(challengeMembers).values({ challengeId: c.id, userId }).onConflictDoNothing();
  return c;
}

/** Featured challenges have no code to share; anyone can join them from the challenges page. */
export async function joinFeatured(db: DbLike, userId: string, challengeId: string) {
  const c = await db.query.challenges.findFirst({ where: and(eq(challenges.id, challengeId), isNotNull(challenges.featuredSlug)) });
  if (!c) throw notFound("Challenge");
  await db.insert(challengeMembers).values({ challengeId: c.id, userId }).onConflictDoNothing();
  return c;
}

async function isMember(db: DbLike, userId: string, challengeId: string) {
  const m = await db.query.challengeMembers.findFirst({ where: and(eq(challengeMembers.challengeId, challengeId), eq(challengeMembers.userId, userId)) });
  return Boolean(m);
}

/** Members see a challenge; so does anyone, for a featured one. */
export async function visibleChallenge(db: DbLike, userId: string, id: string): Promise<{ challenge: Challenge; member: boolean }> {
  const c = await db.query.challenges.findFirst({ where: eq(challenges.id, id) });
  if (!c) throw notFound("Challenge");
  const member = await isMember(db, userId, id);
  if (!member && !c.featuredSlug) throw notFound("Challenge");
  return { challenge: c, member };
}

export async function leaveChallenge(db: DbLike, userId: string, id: string) {
  const c = await db.query.challenges.findFirst({ where: eq(challenges.id, id) });
  if (!c) throw notFound("Challenge");
  if (c.ownerId === userId) throw conflict("You started this challenge. Delete it instead, or keep it going.");
  await db.delete(bingoSquares).where(and(eq(bingoSquares.challengeId, id), eq(bingoSquares.userId, userId)));
  await db.delete(challengeMembers).where(and(eq(challengeMembers.challengeId, id), eq(challengeMembers.userId, userId)));
}

export async function deleteChallenge(db: DbLike, userId: string, id: string) {
  const c = await db.query.challenges.findFirst({ where: eq(challenges.id, id) });
  if (!c || c.ownerId !== userId) {
    if (c && (await isMember(db, userId, id))) throw new DomainError("forbidden", "Only the person who started a challenge can delete it");
    throw notFound("Challenge");
  }
  await db.delete(challenges).where(eq(challenges.id, id));
}

// ─── Progress ────────────────────────────────────────────────────────────────

/** Works the reader finished inside the window, with the date of their last finish there. */
async function finishedIn(db: DbLike, userIds: string[], from: string, to: string) {
  if (userIds.length === 0) return new Map<string, Map<string, string>>();
  const rows = await db
    .select({ userId: readThroughs.userId, workId: readThroughs.workId, finishedAt: readThroughs.finishedAt })
    .from(readThroughs)
    .where(
      and(
        inArray(readThroughs.userId, userIds),
        eq(readThroughs.outcome, "finished"),
        gte(readThroughs.finishedAt, from),
        lte(readThroughs.finishedAt, to),
      ),
    );
  const out = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const mine = out.get(r.userId) ?? new Map<string, string>();
    const prev = mine.get(r.workId);
    if (!prev || r.finishedAt! > prev) mine.set(r.workId, r.finishedAt!);
    out.set(r.userId, mine);
  }
  return out;
}

/** When each reader first owned each work, in ms. */
async function ownedSince(db: DbLike, userIds: string[], workIds: string[]) {
  const out = new Map<string, number>();
  if (userIds.length === 0 || workIds.length === 0) return out;
  const rows = await db
    .select({ userId: copies.userId, workId: editions.workId, createdAt: copies.createdAt })
    .from(copies)
    .innerJoin(editions, eq(copies.editionId, editions.id))
    .where(and(inArray(copies.userId, userIds), inArray(editions.workId, workIds)));
  for (const r of rows) {
    const key = `${r.userId}:${r.workId}`;
    const t = r.createdAt.getTime();
    if (!out.has(key) || t < out.get(key)!) out.set(key, t);
  }
  return out;
}

const startMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export type Progress = {
  done: number;
  /** Books for "books"/"shelf"; squares to fill for bingo. */
  goal: number;
  /** Bingo only: complete rows, columns and diagonals. */
  lines: number;
};

export type MemberProgress = { userId: string; name: string; progress: Progress };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Reader";

async function squaresFor(db: DbLike, challengeId: string, userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select().from(bingoSquares).where(and(eq(bingoSquares.challengeId, challengeId), inArray(bingoSquares.userId, userIds)));
}

/** Progress for each given member, from the reads they logged; nothing about it is stored. */
async function progressOf(db: DbLike, c: Challenge, userIds: string[]): Promise<Map<string, Progress>> {
  const finished = await finishedIn(db, userIds, c.startsOn, c.endsOn);
  const out = new Map<string, Progress>();
  if (c.kind === "bingo") {
    const squares = await squaresFor(db, c.id, userIds);
    for (const id of userIds) {
      const mine = finished.get(id) ?? new Map();
      const filled = new Set(squares.filter((s) => s.userId === id && mine.has(s.workId)).map((s) => s.square));
      out.set(id, { done: filled.size, goal: squaresToFill(c.card ?? []), lines: completedLines(filled, cardSize(c.card ?? [])).length });
    }
    return out;
  }
  const allWorks = [...new Set([...finished.values()].flatMap((m) => [...m.keys()]))];
  const owned = c.kind === "shelf" ? await ownedSince(db, userIds, allWorks) : new Map<string, number>();
  for (const id of userIds) {
    const works = [...(finished.get(id)?.keys() ?? [])];
    const counted = c.kind === "shelf" ? works.filter((w) => (owned.get(`${id}:${w}`) ?? Infinity) < startMs(c.startsOn)) : works;
    out.set(id, { done: counted.length, goal: c.target ?? 0, lines: 0 });
  }
  return out;
}

export async function membersWithProgress(db: DbLike, c: Challenge): Promise<MemberProgress[]> {
  const rows = await db
    .select({ userId: challengeMembers.userId, name: user.name })
    .from(challengeMembers)
    .innerJoin(user, eq(challengeMembers.userId, user.id))
    .where(eq(challengeMembers.challengeId, c.id))
    .orderBy(asc(challengeMembers.joinedAt));
  const progress = await progressOf(db, c, rows.map((r) => r.userId));
  return rows
    .map((r) => ({ userId: r.userId, name: firstName(r.name), progress: progress.get(r.userId)! }))
    .sort((a, b) => b.progress.lines - a.progress.lines || b.progress.done - a.progress.done);
}

/** How far along the reader should be by today to finish on time, as a count of books or squares. */
export function expectedByNow(c: Pick<Challenge, "startsOn" | "endsOn">, goal: number, today: string) {
  const start = startMs(c.startsOn);
  const end = startMs(c.endsOn) + 86_400_000;
  const now = Math.min(Math.max(startMs(today) + 86_400_000, start), end);
  return (goal * (now - start)) / (end - start);
}

export function daysLeft(c: Pick<Challenge, "endsOn">, today: string) {
  return Math.max(0, Math.round((startMs(c.endsOn) - startMs(today)) / 86_400_000) + 1);
}

export type ChallengeCard = Challenge & { progress: Progress; members: number; joined: boolean };

/** The reader's challenges, newest first, with their own progress. */
export async function challengesFor(db: DbLike, userId: string): Promise<ChallengeCard[]> {
  const rows = await db
    .select({ c: challenges })
    .from(challengeMembers)
    .innerJoin(challenges, eq(challengeMembers.challengeId, challenges.id))
    .where(eq(challengeMembers.userId, userId))
    .orderBy(asc(challenges.endsOn));
  return Promise.all(rows.map(async ({ c }) => ({ ...c, ...(await summary(db, c, userId)), joined: true })));
}

async function summary(db: DbLike, c: Challenge, userId: string) {
  const [progress, members] = await Promise.all([
    progressOf(db, c, [userId]).then((m) => m.get(userId)!),
    db.$count(challengeMembers, eq(challengeMembers.challengeId, c.id)),
  ]);
  return { progress, members };
}

/** Featured challenges that haven't ended, and whether the reader is in them. */
export async function featuredFor(db: DbLike, userId: string, today: string = todayUtc()): Promise<ChallengeCard[]> {
  const rows = await db.query.challenges.findMany({
    where: and(isNotNull(challenges.featuredSlug), isNull(challenges.ownerId), gte(challenges.endsOn, today)),
    orderBy: [asc(challenges.startsOn), asc(challenges.kind)],
  });
  return Promise.all(rows.map(async (c) => ({ ...c, ...(await summary(db, c, userId)), joined: await isMember(db, userId, c.id) })));
}

// ─── Bingo ───────────────────────────────────────────────────────────────────

/**
 * A book on a square. `counts` once the reader finishes it inside the challenge window;
 * until then it's pencilled in.
 */
export type PlacedSquare = { square: number; workId: string; title: string; author: string | null; coverUrl: string | null; counts: boolean };

type BookInfo = { workId: string; title: string; author: string | null; coverUrl: string | null; facts: BookFacts; finished: boolean };

/**
 * What a reader's books look like to the bingo rules. Unfinished books are judged as if
 * finished today, so a planned book can be matched to squares before it's read.
 */
async function booksFor(db: DbLike, userId: string, c: Challenge, workIds: string[], today: string): Promise<BookInfo[]> {
  const ids = [...new Set(workIds)];
  if (ids.length === 0) return [];
  const finished = (await finishedIn(db, [userId], c.startsOn, c.endsOn)).get(userId) ?? new Map<string, string>();
  const [ws, owned, mine] = await Promise.all([
    db.query.works.findMany({ where: inArray(works.id, ids), with: { editions: true } }),
    ownedSince(db, [userId], ids),
    db
      .select({ workId: editions.workId, edition: editions })
      .from(copies)
      .innerJoin(editions, eq(copies.editionId, editions.id))
      .where(and(eq(copies.userId, userId), inArray(editions.workId, ids))),
  ]);
  return ws.map((w) => {
    const edition = mine.find((m) => m.workId === w.id)?.edition ?? w.editions.find((e) => e.pageCount) ?? w.editions[0];
    const finishedOn = finished.get(w.id);
    return {
      workId: w.id,
      title: edition?.title || w.title,
      author: w.authors[0] ?? null,
      coverUrl: edition?.coverUrl ?? w.editions.find((e) => e.coverUrl)?.coverUrl ?? null,
      finished: Boolean(finishedOn),
      facts: {
        title: edition?.title || w.title,
        pages: edition?.pageCount ?? w.editions.find((e) => e.pageCount)?.pageCount ?? null,
        year: w.firstPublishYear,
        subjects: w.subjects,
        language: edition?.language ?? null,
        ownedSince: owned.get(`${userId}:${w.id}`) ?? null,
        finishedOn: finishedOn ?? today,
      },
    };
  });
}

export type BingoCandidate = { workId: string; title: string; author: string | null; coverUrl: string | null; fits: number[] };

export type BingoBoard = {
  card: string[];
  size: number;
  placed: PlacedSquare[];
  lines: number[][];
  /** Finished in the window and not on the card yet: these count as soon as they're placed. */
  finished: BingoCandidate[];
  /** In the reader's library but not finished in the window: can be pencilled in. */
  planned: BingoCandidate[];
};

/** Reading now first, then what's next on the pile, then the rest of the library. */
const PLAN_ORDER: Record<string, number> = { reading: 0, paused: 1, want_to_read: 2 };

export async function bingoBoard(db: DbLike, userId: string, c: Challenge, today: string = todayUtc()): Promise<BingoBoard> {
  if (c.kind !== "bingo" || !c.card) throw invalid("That isn't a bingo challenge");
  const card = c.card;
  const size = cardSize(card);
  const squares = await squaresFor(db, c.id, [userId]);
  const finishedIds = [...((await finishedIn(db, [userId], c.startsOn, c.endsOn)).get(userId)?.keys() ?? [])];

  // The library, for planning: owned copies and tracked books, minus what was read in the window.
  const [ownedRows, tracked] = await Promise.all([
    db.selectDistinct({ workId: editions.workId }).from(copies).innerJoin(editions, eq(copies.editionId, editions.id)).where(eq(copies.userId, userId)),
    db.select({ workId: readingStatus.workId, status: readingStatus.status }).from(readingStatus).where(eq(readingStatus.userId, userId)),
  ]);
  const statusOf = new Map(tracked.map((t) => [t.workId, t.status]));
  const finishedSet = new Set(finishedIds);
  const libraryIds = [...new Set([...ownedRows.map((r) => r.workId), ...tracked.map((t) => t.workId)])].filter(
    (id) => !finishedSet.has(id) && statusOf.get(id) !== "read" && statusOf.get(id) !== "dnf",
  );

  const books = await booksFor(db, userId, c, [...finishedIds, ...libraryIds, ...squares.map((s) => s.workId)], today);
  const byWork = new Map(books.map((b) => [b.workId, b]));
  const placed: PlacedSquare[] = squares.flatMap((s) => {
    const b = byWork.get(s.workId);
    return b ? [{ square: s.square, workId: s.workId, title: b.title, author: b.author, coverUrl: b.coverUrl, counts: b.finished }] : [];
  });
  const taken = new Set(squares.map((s) => s.square));
  const onCard = new Set(squares.map((s) => s.workId));
  const candidate = (b: BookInfo): BingoCandidate => ({
    workId: b.workId,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl,
    fits: fittingSquares(card, b.facts).filter((i) => !taken.has(i)),
  });
  const finished = finishedIds
    .flatMap((id) => (byWork.has(id) && !onCard.has(id) ? [candidate(byWork.get(id)!)] : []))
    .sort((a, b) => b.fits.length - a.fits.length || a.title.localeCompare(b.title));
  const planned = libraryIds
    .flatMap((id) => (byWork.has(id) && !onCard.has(id) ? [candidate(byWork.get(id)!)] : []))
    .sort(
      (a, b) =>
        (PLAN_ORDER[statusOf.get(a.workId) ?? ""] ?? 3) - (PLAN_ORDER[statusOf.get(b.workId) ?? ""] ?? 3) ||
        b.fits.length - a.fits.length ||
        a.title.localeCompare(b.title),
    );
  const filled = new Set(placed.filter((p) => p.counts).map((p) => p.square));
  return { card, size, placed, lines: completedLines(filled, size), finished, planned };
}

/**
 * Puts a book on a square. Any book will do: one finished in the window counts straight away,
 * anything else is pencilled in until it's finished.
 */
export async function placeBook(db: DbLike, userId: string, challengeId: string, square: number, workId: string) {
  const { challenge: c, member } = await visibleChallenge(db, userId, challengeId);
  if (!member) throw invalid("Join the challenge first");
  if (c.kind !== "bingo" || !c.card) throw invalid("That isn't a bingo challenge");
  if (!Number.isInteger(square) || c.card[square] === undefined || square === freeSquare(cardSize(c.card))) throw invalid("Pick a square on the card");
  const work = await db.query.works.findFirst({ where: eq(works.id, workId), columns: { id: true } });
  if (!work) throw notFound("Book");
  const elsewhere = await db.query.bingoSquares.findFirst({
    where: and(eq(bingoSquares.challengeId, c.id), eq(bingoSquares.userId, userId), eq(bingoSquares.workId, workId)),
  });
  if (elsewhere && elsewhere.square !== square) throw conflict(`That book is already on “${category(c.card[elsewhere.square]!)?.label ?? "another square"}”`);
  await db
    .insert(bingoSquares)
    .values({ challengeId: c.id, userId, square, workId })
    .onConflictDoUpdate({ target: [bingoSquares.challengeId, bingoSquares.userId, bingoSquares.square], set: { workId } });
}

export async function clearSquare(db: DbLike, userId: string, challengeId: string, square: number) {
  await db.delete(bingoSquares).where(and(eq(bingoSquares.challengeId, challengeId), eq(bingoSquares.userId, userId), eq(bingoSquares.square, square)));
}

export type BookChallengeNote =
  | { kind: "counts"; challengeId: string; title: string }
  | {
      kind: "bingo";
      challengeId: string;
      title: string;
      /** Finished in the window: placing it counts. Otherwise it would be pencilled in. */
      finished: boolean;
      squares: { square: number; label: string }[];
      placedOn: string | null;
    };

/**
 * For the book page: the reader's running challenges this book counts toward, and bingo squares it
 * could fill, or be pencilled in for if it isn't read yet.
 */
export async function bookInChallenges(db: DbLike, userId: string, workId: string, today: string = todayUtc()): Promise<BookChallengeNote[]> {
  const mine = await db
    .select({ c: challenges })
    .from(challengeMembers)
    .innerJoin(challenges, eq(challengeMembers.challengeId, challenges.id))
    .where(and(eq(challengeMembers.userId, userId), gte(challenges.endsOn, today)));
  const notes: BookChallengeNote[] = [];
  for (const { c } of mine) {
    const [book] = await booksFor(db, userId, c, [workId], today);
    if (!book) continue;
    if (book.finished && c.kind === "books") notes.push({ kind: "counts", challengeId: c.id, title: c.title });
    if (book.finished && c.kind === "shelf" && book.facts.ownedSince !== null && book.facts.ownedSince < startMs(c.startsOn)) {
      notes.push({ kind: "counts", challengeId: c.id, title: c.title });
    }
    if (c.kind === "bingo" && c.card) {
      const squares = await squaresFor(db, c.id, [userId]);
      const placed = squares.find((s) => s.workId === workId);
      const taken = new Set(squares.map((s) => s.square));
      const fits = fittingSquares(c.card, book.facts).filter((i) => !taken.has(i));
      // An unread book with no square to suggest and nothing placed isn't worth a mention.
      if (!book.finished && !placed && fits.length === 0) continue;
      notes.push({
        kind: "bingo",
        challengeId: c.id,
        title: c.title,
        finished: book.finished,
        squares: fits.map((i) => ({ square: i, label: category(c.card![i]!)?.label ?? "" })),
        placedOn: placed ? (category(c.card[placed.square]!)?.label ?? null) : null,
      });
    }
  }
  return notes;
}

// ─── Featured challenges ─────────────────────────────────────────────────────

/**
 * Readmoth's own challenges for the year, created on boot if missing. From November the
 * next year's appear too, so people can sign up before New Year.
 */
export async function ensureFeaturedChallenges(db: DbLike, today: string = todayUtc()) {
  const year = Number(today.slice(0, 4));
  const years = Number(today.slice(5, 7)) >= 11 ? [year, year + 1] : [year];
  for (const y of years) {
    const window = { startsOn: `${y}-01-01`, endsOn: `${y}-12-31` };
    const wanted = [
      { featuredSlug: `books-${y}`, kind: "books" as const, title: `Read 24 books in ${y}`, target: 24, card: null, theme: null },
      { featuredSlug: `shelf-${y}`, kind: "shelf" as const, title: `Read your shelf: 12 in ${y}`, target: 12, card: null, theme: null },
      // The same card every boot: seeded by year, so it never reshuffles under people.
      { featuredSlug: `bingo-${y}`, kind: "bingo" as const, title: `${y} Book Bingo`, target: null, card: randomCard("classic" as ThemeId, 5, seededRng(y)), theme: "classic" },
    ];
    for (const f of wanted) {
      await db
        .insert(challenges)
        .values({ ...f, ...window, ownerId: null, joinCode: newJoinCode() })
        .onConflictDoNothing({ target: challenges.featuredSlug });
    }
  }
}

