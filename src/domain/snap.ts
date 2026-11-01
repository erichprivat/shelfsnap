import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbLike } from "@/db";
import { copies, editions, snapSessions, snapSpines, type SpineCandidate } from "@/db/schema";
import type { DetectedSpine, SpineReader } from "@/sources/spine-reader";
import { SpineReaderError } from "@/sources/spine-reader";
import { createManualBook, searchLocal, upsertBook, type BookRecord, type CatalogueSource } from "./catalogue";
import { conflict, invalid, notFound } from "./errors";
import { getOwnedLocation } from "./locations";
import { recordUsage } from "./usage";
import { positionBetween } from "./ordering";
import { mainTitle, normalizeText, tokenCoverage, tokens, workMatchKey } from "./text";

export const MAX_SNAP_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export const CONFIDENT = 0.8;
export const MARGIN = 0.15;
export const PLAUSIBLE = 0.45;
const CANDIDATES_PER_SPINE = 4;

type Session = typeof snapSessions.$inferSelect;

export function validateSnapUpload(file: { size: number; type: string }) {
  if (file.size === 0) throw invalid("That photo is empty");
  if (file.size > MAX_SNAP_BYTES) throw invalid("That photo is too large (20 MB max)");
  if (!ACCEPTED_TYPES.has(file.type)) throw invalid("Upload a JPEG, PNG, WebP or HEIC photo");
}

export async function getOwnedSession(db: DbLike, userId: string, id: string): Promise<Session> {
  const s = await db.query.snapSessions.findFirst({ where: and(eq(snapSessions.id, id), eq(snapSessions.userId, userId)) });
  if (!s) throw notFound("Snap");
  return s;
}

export async function createSnapSession(db: DbLike, userId: string, input: { imagePath: string; locationId: string | null }) {
  if (input.locationId) await getOwnedLocation(db, userId, input.locationId);
  const [row] = await db
    .insert(snapSessions)
    .values({ userId, locationId: input.locationId, imagePath: input.imagePath, status: "processing" })
    .returning();
  return row!;
}

/** `book` groups candidates that are the same book under different catalogue records. */
type Scored = { editionId: string; workId: string; score: number; book: string };

/**
 * Scores a candidate against what's printed on the spine. The title carries
 * most of the weight; the author confirms it. A truncated spine ("THE REMAINS
 * OF THE") can reach "ambiguous" but never "confident" on its own.
 */
export function scoreCandidate(
  spine: Pick<DetectedSpine, "text" | "title" | "author">,
  cand: { title: string; authors: string[]; editionTitles?: string[] },
) {
  // A translated edition ("The Plague") sits under a work titled in the original ("La Peste").
  const titles = [cand.title, ...(cand.editionTitles ?? [])];
  return Math.max(...titles.map((t) => scoreTitle(spine, mainTitle(t), cand.authors)));
}

function scoreTitle(spine: Pick<DetectedSpine, "text" | "title" | "author">, title: string, authors: string[]) {
  // A record titled after its author ("Stefan Zweig", a collected volume) can't be matched by the byline.
  const authorWords = new Set(authors.flatMap(tokens));
  if (tokens(title).every((t) => authorWords.has(t))) return 0;
  const observed = [spine.text, spine.title, spine.author].filter(Boolean).join(" ");
  const recall = tokenCoverage(observed, title);
  if (recall === 0) return 0;
  const precision = tokenCoverage(title, spine.title ?? spine.text);
  const titleScore = recall >= 0.5 ? Math.max(recall, 0.6 * precision) : recall;

  const titleWords = new Set(tokens(title));
  const leftover = tokens(observed).filter((t) => !titleWords.has(t));
  // Nothing on the spine besides the title: the author is unknown, not contradicted.
  if (authors.length === 0 || (leftover.length === 0 && !spine.author)) return titleScore * 0.85;
  // Records often list a co-author, editor or translator first; any of them on the spine counts.
  const authorScore = Math.max(...authors.map((a) => tokenCoverage(observed, a)));
  // A one-word title ("Sult") is weak evidence alone; let the author decide.
  const titleWeight = titleWords.size <= 1 ? 0.55 : 0.75;
  return titleScore * titleWeight + authorScore * (1 - titleWeight);
}

export type SpineState = (typeof snapSpines.$inferSelect)["state"];

export function classify(scored: { score: number }[], ownsTop: boolean): SpineState {
  const [best, second] = scored;
  if (!best || best.score < PLAUSIBLE) return "unmatched";
  const clear = best.score >= CONFIDENT && best.score - (second?.score ?? 0) >= MARGIN;
  if (!clear) return "ambiguous";
  return ownsTop ? "duplicate" : "matched";
}

type RemoteHit = { rec: BookRecord; score: number };

/**
 * Asks the catalogue in up to three ways, stopping once a hit is confident:
 * free text, then title + author fields, then title alone. Free text misses
 * punctuation-heavy titles; the structured search finds them.
 */
async function remoteCandidates(catalogue: CatalogueSource, spine: DetectedSpine): Promise<RemoteHit[]> {
  const freeText = spine.title ? [spine.title, spine.author].filter(Boolean).join(" ") : spine.text;
  const attempts: (() => Promise<BookRecord[]>)[] = [() => catalogue.search(freeText, 6)];
  if (spine.title) {
    if (spine.author) attempts.push(() => catalogue.searchByTitle(spine.title!, spine.author, 6));
    attempts.push(() => catalogue.searchByTitle(spine.title!, null, 6));
  }
  const hits: RemoteHit[] = [];
  for (const attempt of attempts) {
    let recs: BookRecord[];
    try {
      recs = await attempt();
    } catch {
      // Catalogue outages degrade to "unmatched"; the user can search by hand.
      break;
    }
    for (const rec of recs) {
      const score = scoreCandidate(spine, { ...rec, editionTitles: rec.edition?.title ? [rec.edition.title] : [] });
      if (score >= PLAUSIBLE / 2) hits.push({ rec, score });
    }
    if (hits.some((h) => h.score >= CONFIDENT)) break;
  }
  return hits;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const authorPrefix = (author: string) =>
  new RegExp(`^${author.trim().split(/[\s.]+/).filter(Boolean).map(escapeRegExp).join("[\\s.]+")}[\\s.,:–—-]+`, "i");

/** Same main title, keyed on the author actually printed on the spine (records order co-authors differently). */
function bookKey(spine: DetectedSpine, title: string, authors: string[]) {
  const observed = [spine.text, spine.title, spine.author].filter(Boolean).join(" ");
  const onSpine = authors.find((a) => tokenCoverage(observed, a) > 0) ?? authors[0] ?? "";
  // Some records bake the author into the title: "Stefan Zweig - Sternstunden der Menschheit".
  const bare = authors.reduce((t, a) => t.replace(authorPrefix(a), ""), title).trim();
  return workMatchKey(bare || title, [onSpine]);
}

async function localCandidates(db: Db, spine: DetectedSpine): Promise<Scored[]> {
  const local = await searchLocal(db, spine.title ?? spine.text, 8);
  return local.flatMap((w) => {
    const edition = w.editions.find((e) => e.isbn13) ?? w.editions[0];
    if (!edition) return [];
    const score = scoreCandidate(spine, { ...w, editionTitles: w.editions.map((e) => e.title) });
    return [{ editionId: edition.id, workId: w.id, score, book: bookKey(spine, edition.title, w.authors) }];
  });
}

async function candidatesFor(db: Db, catalogue: CatalogueSource, spines: DetectedSpine[]): Promise<Scored[][]> {
  // Reads and network calls run in parallel; catalogue writes stay sequential so dedupe can't race.
  const gathered = await mapLimit(spines, 4, async (spine) => {
    if (tokens(spine.title ?? spine.text).length === 0) return { local: [], remote: [] };
    const local = await localCandidates(db, spine);
    const confidentLocally = local.some((c) => c.score >= CONFIDENT);
    return { local, remote: confidentLocally ? [] : await remoteCandidates(catalogue, spine) };
  });
  const results: Scored[][] = [];
  for (const [i, { local, remote }] of gathered.entries()) {
    const spine = spines[i]!;
    const byBook = new Map<string, Scored>();
    const keep = (c: Scored) => {
      const prev = byBook.get(c.book);
      if (!prev || prev.score < c.score) byBook.set(c.book, c);
    };
    local.forEach(keep);
    for (const { rec, score } of remote) {
      const entry = await upsertBook(db, rec);
      keep({ ...entry, score, book: bookKey(spine, rec.edition?.title ?? rec.title, rec.authors) });
    }
    results.push([...byBook.values()].sort((a, b) => b.score - a.score).slice(0, CANDIDATES_PER_SPINE));
  }
  return results;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function ownedWorkIds(db: DbLike, userId: string, workIds: string[]) {
  if (workIds.length === 0) return new Set<string>();
  const rows = await db
    .selectDistinct({ workId: editions.workId })
    .from(copies)
    .innerJoin(editions, eq(copies.editionId, editions.id))
    .where(and(eq(copies.userId, userId), inArray(editions.workId, workIds)));
  return new Set(rows.map((r) => r.workId));
}

/** Reads the photo and stores one row per spine with ranked candidates. Never throws for reader failures: the session records them. */
export async function processSnap(
  db: Db,
  reader: SpineReader,
  catalogue: CatalogueSource,
  userId: string,
  sessionId: string,
  image: Uint8Array,
) {
  const session = await getOwnedSession(db, userId, sessionId);
  if (session.status !== "processing" && session.status !== "failed") return session;

  let detected: DetectedSpine[];
  try {
    const result = await reader.read(image);
    detected = result.spines;
    if (result.usage) await recordUsage(db, userId, sessionId, result.usage);
  } catch (e) {
    const error = e instanceof SpineReaderError ? e.message : "Something went wrong reading the photo. Try again.";
    await db.update(snapSessions).set({ status: "failed", error }).where(eq(snapSessions.id, sessionId));
    return { ...session, status: "failed" as const, error };
  }

  const usable = detected.filter((d) => normalizeText(d.text).length > 0 || d.title);
  const candidates = await candidatesFor(db, catalogue, usable);
  const results = usable.map((spine, i) => ({ spine, scored: candidates[i]! }));
  const owned = await ownedWorkIds(db, userId, results.flatMap((r) => r.scored.slice(0, 1).map((s) => s.workId)));

  await db.transaction(async (tx) => {
    await tx.delete(snapSpines).where(eq(snapSpines.sessionId, sessionId));
    for (const [ordinal, { spine, scored }] of results.entries()) {
      const state = classify(scored, scored[0] ? owned.has(scored[0].workId) : false);
      const candidates: SpineCandidate[] = scored.map((s) => ({ editionId: s.editionId, score: Math.round(s.score * 100) / 100 }));
      await tx.insert(snapSpines).values({
        sessionId,
        ordinal,
        rawText: spine.text || [spine.title, spine.author].filter(Boolean).join(" "),
        box: spine.box,
        state,
        candidates,
        chosenEditionId: state === "matched" || state === "duplicate" ? scored[0]!.editionId : null,
      });
    }
    await tx.update(snapSessions).set({ status: "ready", error: null }).where(eq(snapSessions.id, sessionId));
  });
  return getOwnedSession(db, userId, sessionId);
}

async function getOwnedSpine(db: DbLike, userId: string, spineId: string) {
  const spine = await db.query.snapSpines.findFirst({ where: eq(snapSpines.id, spineId), with: { session: true } });
  if (!spine || spine.session.userId !== userId) throw notFound("Spine");
  if (spine.session.status === "committed") throw conflict("This shelf has already been added to your library");
  if (spine.session.status !== "ready") throw invalid("This photo hasn't been read yet");
  return spine;
}

/** Confirms a spine as a specific edition — a listed candidate, or any edition the user found by searching. */
export async function confirmSpine(db: DbLike, userId: string, spineId: string, editionId?: string) {
  const spine = await getOwnedSpine(db, userId, spineId);
  const chosen = editionId ?? spine.chosenEditionId;
  if (!chosen) throw invalid("Pick which book this is first");
  const exists = await db.query.editions.findFirst({ where: eq(editions.id, chosen), columns: { id: true } });
  if (!exists) throw notFound("Edition");
  await db.update(snapSpines).set({ state: "confirmed", chosenEditionId: chosen }).where(eq(snapSpines.id, spineId));
}

export async function rejectSpine(db: DbLike, userId: string, spineId: string) {
  await getOwnedSpine(db, userId, spineId);
  await db.update(snapSpines).set({ state: "rejected", chosenEditionId: null }).where(eq(snapSpines.id, spineId));
}

/** One tap: confirm every confident match. Duplicates stay for an explicit decision. */
export async function confirmAllMatched(db: DbLike, userId: string, sessionId: string) {
  const session = await getOwnedSession(db, userId, sessionId);
  if (session.status !== "ready") throw invalid("This photo isn't ready for review");
  const res = await db
    .update(snapSpines)
    .set({ state: "confirmed" })
    .where(and(eq(snapSpines.sessionId, sessionId), eq(snapSpines.state, "matched")))
    .returning({ id: snapSpines.id });
  return res.length;
}

/**
 * Adds confirmed spines to the library as physical copies, in shelf order,
 * after whatever is already in the location. Safe to call twice.
 */
export async function commitSnap(db: Db, userId: string, sessionId: string) {
  return db.transaction(async (tx) => {
    const session = await getOwnedSession(tx, userId, sessionId);
    if (session.status === "committed") return { added: 0 };
    if (session.status !== "ready") throw invalid("This photo isn't ready for review");

    const confirmed = await tx.query.snapSpines.findMany({
      where: and(eq(snapSpines.sessionId, sessionId), eq(snapSpines.state, "confirmed")),
      orderBy: [asc(snapSpines.ordinal)],
    });
    const scope = and(
      eq(copies.userId, userId),
      session.locationId ? eq(copies.locationId, session.locationId) : isNull(copies.locationId),
    );
    const [end] = await tx.select({ p: sql<number | null>`max(${copies.position})` }).from(copies).where(scope);
    let pos = end?.p ?? null;
    for (const spine of confirmed) {
      if (!spine.chosenEditionId) continue;
      pos = positionBetween(pos, null);
      await tx.insert(copies).values({
        userId,
        editionId: spine.chosenEditionId,
        format: "physical",
        locationId: session.locationId,
        position: pos,
      });
    }
    await tx.update(snapSessions).set({ status: "committed" }).where(eq(snapSessions.id, sessionId));
    return { added: confirmed.filter((s) => s.chosenEditionId).length };
  });
}

export type BookChoice = { editionId: string } | { title: string; author?: string | null };

async function resolveChoice(db: DbLike, choice: BookChoice) {
  if ("editionId" in choice) {
    const e = await db.query.editions.findFirst({ where: eq(editions.id, choice.editionId), columns: { id: true } });
    if (!e) throw notFound("Edition");
    return e.id;
  }
  return (await createManualBook(db, choice)).editionId;
}

/** Confirms a spine as a different book: a search result, or one the user typed in. */
export async function correctSpine(db: Db, userId: string, spineId: string, choice: BookChoice) {
  await getOwnedSpine(db, userId, spineId);
  const editionId = await resolveChoice(db, choice);
  await confirmSpine(db, userId, spineId, editionId);
}

/**
 * Adds a book the photo missed, right after spine `afterOrdinal` (or first when null),
 * so the shelf order on commit matches the real shelf.
 */
export async function addMissedBook(db: Db, userId: string, sessionId: string, choice: BookChoice, afterOrdinal: number | null) {
  return db.transaction(async (tx) => {
    const session = await getOwnedSession(tx, userId, sessionId);
    if (session.status === "committed") throw conflict("This shelf has already been added to your library");
    if (session.status !== "ready") throw invalid("This photo hasn't been read yet");
    const spines = await tx.query.snapSpines.findMany({ where: eq(snapSpines.sessionId, sessionId), columns: { ordinal: true } });
    const count = spines.length;
    if (afterOrdinal !== null && (!Number.isInteger(afterOrdinal) || afterOrdinal < 0 || afterOrdinal >= count)) {
      throw invalid("Pick where on the shelf it stands");
    }
    const editionId = await resolveChoice(tx, choice);
    const ordinal = afterOrdinal === null ? 0 : afterOrdinal + 1;
    // Two steps so the unique (session, ordinal) index never sees a collision mid-shift.
    await tx.update(snapSpines).set({ ordinal: sql`${snapSpines.ordinal} + 100000` }).where(and(eq(snapSpines.sessionId, sessionId), gte(snapSpines.ordinal, ordinal)));
    await tx.update(snapSpines).set({ ordinal: sql`${snapSpines.ordinal} - 99999` }).where(and(eq(snapSpines.sessionId, sessionId), gte(snapSpines.ordinal, 100000)));
    const [row] = await tx
      .insert(snapSpines)
      .values({ sessionId, ordinal, rawText: "", box: null, state: "confirmed", candidates: [], chosenEditionId: editionId })
      .returning();
    return row!;
  });
}
