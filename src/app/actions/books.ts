"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { readingStatuses, type CopyFormat, type ReadingStatus } from "@/db/schema";
import { resolveIsbn, searchLocal, upsertBook } from "@/domain/catalogue";
import { addCopy, lendCopy, moveCopy, removeCopy, reorderCopy, returnCopy, updateCopyDetails } from "@/domain/copies";
import { invalid } from "@/domain/errors";
import { clearStatus, deleteReadThrough, setStatus, startReread, updateReadThrough } from "@/domain/reading";
import { run } from "@/server/action";
import { requireUser } from "@/server/auth";
import { catalogueSource } from "@/server/services";

const touched = (workId?: string) => {
  revalidatePath("/library");
  if (workId) revalidatePath(`/book/${workId}`);
};

function asStatus(s: string): ReadingStatus {
  if (!(readingStatuses as readonly string[]).includes(s)) throw invalid("Unknown reading status");
  return s as ReadingStatus;
}

export async function setStatusAction(workId: string, status: string, opts: { date?: string | null; dateUnknown?: boolean } = {}) {
  const user = await requireUser();
  return run(async () => {
    await setStatus(db, user.id, workId, asStatus(status), opts);
    touched(workId);
  });
}

export async function clearStatusAction(workId: string) {
  const user = await requireUser();
  return run(async () => {
    await clearStatus(db, user.id, workId);
    touched(workId);
  });
}

export async function startRereadAction(workId: string) {
  const user = await requireUser();
  return run(async () => {
    await startReread(db, user.id, workId);
    touched(workId);
  });
}

export async function updateReadAction(
  workId: string,
  id: string,
  patch: { startedAt?: string | null; finishedAt?: string | null; rating?: number | null; review?: string | null },
) {
  const user = await requireUser();
  return run(async () => {
    await updateReadThrough(db, user.id, id, patch);
    touched(workId);
  });
}

export async function deleteReadAction(workId: string, id: string) {
  const user = await requireUser();
  return run(async () => {
    await deleteReadThrough(db, user.id, id);
    touched(workId);
  });
}

export async function addCopyAction(
  workId: string,
  input: { editionId: string; locationId?: string | null; format?: CopyFormat; allowDuplicate?: boolean },
) {
  const user = await requireUser();
  return run(async () => {
    const copy = await addCopy(db, user.id, input);
    touched(workId);
    return copy.id;
  });
}

export async function moveCopyAction(workId: string, copyId: string, locationId: string | null) {
  const user = await requireUser();
  return run(async () => {
    await moveCopy(db, user.id, copyId, locationId);
    touched(workId);
  });
}

export async function reorderCopyAction(copyId: string, afterCopyId: string | null) {
  const user = await requireUser();
  return run(async () => {
    await reorderCopy(db, user.id, copyId, afterCopyId);
    touched();
  });
}

export async function lendCopyAction(workId: string, copyId: string, input: { to: string; dueBack?: string | null }) {
  const user = await requireUser();
  return run(async () => {
    await lendCopy(db, user.id, copyId, input);
    touched(workId);
  });
}

export async function returnCopyAction(workId: string, copyId: string) {
  const user = await requireUser();
  return run(async () => {
    await returnCopy(db, user.id, copyId);
    touched(workId);
  });
}

export async function updateCopyAction(workId: string, copyId: string, patch: Parameters<typeof updateCopyDetails>[3]) {
  const user = await requireUser();
  return run(async () => {
    await updateCopyDetails(db, user.id, copyId, patch);
    touched(workId);
  });
}

export async function removeCopyAction(workId: string, copyId: string) {
  const user = await requireUser();
  return run(async () => {
    await removeCopy(db, user.id, copyId);
    touched(workId);
  });
}

export type FoundBook = {
  workId: string;
  editionId: string;
  title: string;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  isbn13: string | null;
};

/** Searches the local catalogue, then Open Library; remote hits are cached so they can be added by id. */
export async function searchBooksAction(query: string) {
  await requireUser();
  return run(async (): Promise<FoundBook[]> => {
    const q = query.trim().slice(0, 200);
    if (q.length < 2) return [];
    const found = new Map<string, FoundBook>();
    for (const w of await searchLocal(db, q, 8)) {
      const e = w.editions.find((x) => x.coverUrl) ?? w.editions[0];
      if (e) found.set(w.id, { workId: w.id, editionId: e.id, title: w.title, authors: w.authors, year: w.firstPublishYear, coverUrl: e.coverUrl, isbn13: e.isbn13 });
    }
    let remote: Awaited<ReturnType<typeof catalogueSource.search>> = [];
    try {
      remote = await catalogueSource.search(q, 10);
    } catch {
      if (found.size === 0) throw invalid("The book catalogue is unreachable right now. Try again shortly.");
    }
    for (const rec of remote) {
      const { workId, editionId } = await upsertBook(db, rec);
      if (found.has(workId)) continue;
      found.set(workId, {
        workId,
        editionId,
        title: rec.title,
        authors: rec.authors,
        year: rec.firstPublishYear ?? null,
        coverUrl: rec.edition?.coverUrl ?? null,
        isbn13: rec.edition?.isbn13 ?? null,
      });
    }
    return [...found.values()].slice(0, 12);
  });
}

export async function lookupIsbnAction(isbn: string) {
  await requireUser();
  return run(async () => resolveIsbn(db, catalogueSource, isbn));
}
