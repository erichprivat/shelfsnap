"use client";

import { useState, useTransition } from "react";
import { searchBooksAction, type FoundBook } from "@/app/actions/books";
import { BookLine } from "./book-line";
import { ManualBookForm } from "./manual-book-form";
import { Button, ErrorText, Input } from "./ui";

export type PickedBook = { editionId: string } | { title: string; author: string | null };

/** Search the catalogue for a book, or type it in when it isn't there. */
export function BookPicker({ initialQuery = "", pending, onPick, onCancel }: { initialQuery?: string; pending?: boolean; onPick: (book: PickedBook) => void; onCancel?: () => void }) {
  const [q, setQ] = useState(initialQuery.slice(0, 120));
  const [results, setResults] = useState<FoundBook[] | null>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, start] = useTransition();
  const search = () =>
    start(async () => {
      setError(null);
      const res = await searchBooksAction(q);
      if (res.ok) setResults(res.data);
      else setError(res.error);
    });

  if (manual) {
    return (
      <ManualBookForm
        initial={{ title: q }}
        submits={[{ label: "Use this book", value: "use" }]}
        pending={pending}
        onSubmit={(b) => onPick({ title: b.title, author: b.author || null })}
        onCancel={() => setManual(false)}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) search();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or author" className="h-9 text-sm" aria-label="Search for the book" autoFocus />
        <Button size="sm" variant="line" disabled={searching || q.trim().length < 2}>
          {searching ? "Searching…" : "Search"}
        </Button>
        {onCancel && (
          <Button size="sm" type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </form>
      {results?.length === 0 && <p className="text-sm text-ink-3">Nothing found.</p>}
      {results?.map((b) => (
        <button key={b.workId} disabled={pending} onClick={() => onPick({ editionId: b.editionId })} className="rounded-[3px] border border-rule p-2 text-left transition-colors hover:border-ink">
          <BookLine book={b} compact />
        </button>
      ))}
      <button type="button" className="self-start text-[13px] text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setManual(true)}>
        {results?.length === 0 ? "Enter it yourself" : "Can't find it? Enter it yourself"}
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
