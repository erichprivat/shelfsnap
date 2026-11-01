import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { copies, editions, importRecords, readingStatus, readThroughs } from "@/db/schema";
import { upsertBook } from "../catalogue";
import { positionBetween } from "../ordering";
import type { ImportRow, ImportSource, ParseResult } from "./types";

export type ImportReport = {
  source: ImportSource;
  imported: number;
  alreadyImported: number;
  copiesAdded: number;
  statusesKept: number;
  failed: { line: number; title: string; reason: string }[];
  skipped: { line: number; reason: string }[];
  warnings: { line: number; title: string; message: string }[];
};

async function applyRow(db: Db, userId: string, source: ImportSource, row: ImportRow, report: ImportReport) {
  await db.transaction(async (tx) => {
    const seen = await tx.query.importRecords.findFirst({
      where: and(eq(importRecords.userId, userId), eq(importRecords.source, source), eq(importRecords.externalId, row.externalId)),
    });
    if (seen) {
      report.alreadyImported++;
      return;
    }

    const { workId, editionId } = await upsertBook(tx, row.record);

    const existingStatus = await tx.query.readingStatus.findFirst({
      where: and(eq(readingStatus.userId, userId), eq(readingStatus.workId, workId)),
    });
    const existingReads = await tx.query.readThroughs.findFirst({
      where: and(eq(readThroughs.userId, userId), eq(readThroughs.workId, workId)),
    });

    if (row.status && existingStatus && existingStatus.status !== row.status) {
      report.statusesKept++;
    } else if (row.status && !existingStatus) {
      await tx.insert(readingStatus).values({ userId, workId, status: row.status });
    }

    if (!existingReads && row.reads.length) {
      // The rating and review belong to the most recent read.
      const latestIdx = row.reads.reduce(
        (best, r, i) => ((r.finishedAt ?? "") > (row.reads[best]!.finishedAt ?? "") ? i : best),
        0,
      );
      await tx.insert(readThroughs).values(
        row.reads.map((r, i) => {
          const closed = r.outcome !== "in_progress";
          const startedAt = r.startedAt && r.finishedAt && r.startedAt > r.finishedAt ? null : r.startedAt;
          return {
            userId,
            workId,
            editionId,
            outcome: r.outcome,
            startedAt,
            finishedAt: r.finishedAt,
            rating: closed && i === latestIdx ? row.rating : null,
            review: i === latestIdx ? row.review : null,
          };
        }),
      );
    }

    if (row.ownedCopies > 0) {
      const ownsWork = await tx
        .select({ id: copies.id })
        .from(copies)
        .innerJoin(editions, eq(copies.editionId, editions.id))
        .where(and(eq(copies.userId, userId), eq(editions.workId, workId)))
        .limit(1);
      if (ownsWork.length === 0) {
        const [end] = await tx
          .select({ p: sql<number | null>`max(${copies.position})` })
          .from(copies)
          .where(and(eq(copies.userId, userId), isNull(copies.locationId)));
        for (let i = 0; i < row.ownedCopies; i++) {
          await tx.insert(copies).values({
            userId,
            editionId,
            format: row.ownedFormat,
            locationId: null,
            position: positionBetween((end?.p ?? 0) + i, null),
          });
          report.copiesAdded++;
        }
      }
    }

    await tx.insert(importRecords).values({ userId, source, externalId: row.externalId, workId });
    report.imported++;
  });
}

/** Applies parsed rows one by one, so a single bad row never sinks the whole import. Safe to re-run. */
export async function applyImport(db: Db, userId: string, parsed: ParseResult): Promise<ImportReport> {
  const report: ImportReport = {
    source: parsed.source,
    imported: 0,
    alreadyImported: 0,
    copiesAdded: 0,
    statusesKept: 0,
    failed: [],
    skipped: parsed.skipped,
    warnings: [],
  };
  for (const row of parsed.rows) {
    try {
      await applyRow(db, userId, parsed.source, row, report);
      for (const message of row.warnings) report.warnings.push({ line: row.line, title: row.record.title, message });
    } catch (e) {
      report.failed.push({ line: row.line, title: row.record.title, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
