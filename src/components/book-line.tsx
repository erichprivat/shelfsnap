import { Cover } from "./cover";

export type BookSummary = { editionId: string; workId: string; title: string; authors: string[]; year: number | null; coverUrl: string | null };

export function BookLine({ book, compact }: { book: BookSummary; compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <Cover seed={book.workId} title={book.title} authors={book.authors} url={book.coverUrl} size="sm" className={compact ? "w-8 shrink-0" : "w-10 shrink-0"} />
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 font-serif text-[16px] leading-snug">{book.title}</span>
        <span className="truncate text-[13px] text-ink-3">
          {book.authors[0] ?? "Unknown author"}
          {book.year ? ` · ${book.year}` : ""}
        </span>
      </span>
    </span>
  );
}
