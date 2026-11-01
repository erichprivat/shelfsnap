import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbLike } from "@/db";
import { copies, editions, snapSessions, snapSpines, type SpineCandidate } from "@/db/schema";
import type { DetectedSpine, SpineReader } from "@/sources/spine-reader";
import { SpineReaderError } from "@/sources/spine-reader";
import { searchLocal, upsertBook, type CatalogueSource } from "./catalogue";
import { conflict, invalid, notFound } from "./errors";
import { getOwnedLocation } from "./locations";
import { positionBetween } from "./ordering";
import { normalizeText, stripSeries, tokenCoverage, tokens } from "./text";

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

type Scored = { editionId: string; workId: string; score: number };

/**
 * Scores a candidate against what's printed on the spine. The title carries
 * most of the weight; the author confirms it. A truncated spine ("THE REMAINS
 * OF THE") can reach "ambiguous" but never "confident" on its own.
 */
export function scoreCandidate(spine: Pick<DetectedSpine, "text" | "title" | "author">, cand: { title: string; authors: string[] }) {
  const observed = [spine.text, spine.title, spine.author].filter(Boolean).join(" ");
  const title = stripSeries(cand.title).split(":")[0]!;
  const recall = tokenCoverage(observed, title);
  if (recall === 0) return 0;
  const precision = tokenCoverage(title, spine.title ?? spine.text);
  const titleScore = recall >= 0.5 ? Math.max(recall, 0.6 * precision) : recall;

  const author = cand.authors[0];
  const titleWords = new Set(tokens(title));
  const leftover = tokens(observed).filter((t) => !titleWords.has(t));
  // Nothing on the spine besides the title: the author is unknown, not contradicted.
  if (!author || (leftover.length === 0 && !spine.author)) return titleScore * 0.85;
  const authorScore = tokenCoverage(observed, author);
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

async function candidatesFor(db: Db, catalogue: CatalogueSource, spine: DetectedSpine): Promise<Scored[]> {
  const query = spine.title ? [spine.title, spine.author].filter(Boolean).join(" ") : spine.text;
  if (tokens(query).length === 0) return [];

  const local = await searchLocal(db, spine.title ?? spine.text, 8);
  const scored = new Map<string, Scored>();
  for (const w of local) {
    const edition = w.editions.find((e) => e.isbn13) ?? w.editions[0];
    if (!edition) continue;
    scored.set(w.id, { editionId: edition.id, workId: w.id, score: scoreCandidate(spine, w) });
  }

  const bestLocal = Math.max(0, ...[...scored.values()].map((s) => s.score));
  if (bestLocal < CONFIDENT) {
    let remote: Awaited<ReturnType<CatalogueSource["search"]>> = [];
    try {
      remote = await catalogue.search(query, 6);
    } catch {
      // Catalogue outages degrade to "unmatched"; the user can search manually.
    }
    for (const rec of remote) {
      const score = scoreCandidate(spine, rec);
      if (score < PLAUSIBLE / 2) continue;
      const entry = await upsertBook(db, rec);
      const prev = scored.get(entry.workId);
      if (!prev || prev.score < score) scored.set(entry.workId, { ...entry, score });
    }
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, CANDIDATES_PER_SPINE);
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
    detected = await reader.read(image);
  } catch (e) {
    const error = e instanceof SpineReaderError ? e.message : "Something went wrong reading the photo. Try again.";
    await db.update(snapSessions).set({ status: "failed", error }).where(eq(snapSessions.id, sessionId));
    return { ...session, status: "failed" as const, error };
  }

  const usable = detected.filter((d) => normalizeText(d.text).length > 0 || d.title);
  const results: { spine: DetectedSpine; scored: Scored[] }[] = [];
  for (const spine of usable) results.push({ spine, scored: await candidatesFor(db, catalogue, spine) });
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
