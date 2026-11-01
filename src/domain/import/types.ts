import type { CopyFormat, ReadingStatus } from "@/db/schema";
import type { BookRecord } from "../catalogue";
import type { IsoDate } from "../dates";

export type ImportSource = "goodreads" | "storygraph";

export type ImportedRead = {
  outcome: "in_progress" | "finished" | "dnf";
  startedAt: IsoDate | null;
  finishedAt: IsoDate | null;
};

export type ImportRow = {
  line: number;
  externalId: string;
  record: BookRecord;
  status: ReadingStatus | null;
  ownedCopies: number;
  ownedFormat: CopyFormat;
  reads: ImportedRead[];
  rating: number | null;
  review: string | null;
  warnings: string[];
};

export type ParseResult = { source: ImportSource; rows: ImportRow[]; skipped: { line: number; reason: string }[] };
