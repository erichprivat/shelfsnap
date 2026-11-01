import { asc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { editions, snapSpines } from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { locationPath } from "@/domain/locations";
import { getOwnedSession } from "@/domain/snap";
import { requireUser } from "@/server/auth";
import { Review, type ReviewSpine } from "./review";

export const metadata: Metadata = { title: "Review snap" };

export default async function SnapReviewPage({ params }: PageProps<"/snap/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const session = await getOwnedSession(db, user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const spines = await db.query.snapSpines.findMany({ where: eq(snapSpines.sessionId, id), orderBy: [asc(snapSpines.ordinal)] });
  const editionIds = [...new Set(spines.flatMap((s) => [...s.candidates.map((c) => c.editionId), ...(s.chosenEditionId ? [s.chosenEditionId] : [])]))];
  const eds = editionIds.length ? await db.query.editions.findMany({ where: inArray(editions.id, editionIds), with: { work: true } }) : [];
  const byId = new Map(eds.map((e) => [e.id, { editionId: e.id, workId: e.workId, title: e.title || e.work.title, authors: e.work.authors, year: e.work.firstPublishYear, coverUrl: e.coverUrl }]));
  const place = session.locationId ? (await locationPath(db, user.id, session.locationId)).map((l) => l.name).join(" / ") : null;

  const view: ReviewSpine[] = spines.map((s) => ({
    id: s.id,
    ordinal: s.ordinal,
    rawText: s.rawText,
    state: s.state,
    box: s.box,
    chosen: s.chosenEditionId ? (byId.get(s.chosenEditionId) ?? null) : null,
    candidates: s.candidates.map((c) => byId.get(c.editionId)).filter((c) => c !== undefined),
  }));

  return (
    <div className="flex flex-col gap-8">
      <Link href="/snap" className="text-sm text-ink-3 hover:text-ink">
        ← Snap another shelf
      </Link>
      <Review sessionId={session.id} status={session.status} error={session.error} place={place} spines={view} />
    </div>
  );
}
