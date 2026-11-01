"use client";

import { useState } from "react";
import { Button, Field, Input } from "./ui";

export type ManualBook = { title: string; author: string; isbn: string };

/** Title, author and an optional ISBN for a book the catalogue doesn't have. */
export function ManualBookForm<V extends string>({
  initial,
  submits,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ManualBook>;
  submits: { label: string; value: V }[];
  pending?: boolean;
  onSubmit: (book: ManualBook, value: V) => void;
  onCancel?: () => void;
}) {
  const [book, setBook] = useState<ManualBook>({ title: initial?.title ?? "", author: initial?.author ?? "", isbn: initial?.isbn ?? "" });
  const set = (k: keyof ManualBook) => (e: React.ChangeEvent<HTMLInputElement>) => setBook((b) => ({ ...b, [k]: e.target.value }));
  return (
    <form
      className="flex flex-col gap-3 border border-dashed border-rule-strong p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        const value = submits.find((s) => s.value === submitter)?.value ?? submits[0]!.value;
        if (!pending && book.title.trim()) onSubmit(book, value);
      }}
    >
      <span className="text-sm text-ink-2">Not in the catalogue? Type what&apos;s on the cover.</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input value={book.title} onChange={set("title")} required maxLength={300} autoFocus className="h-9 text-sm" />
        </Field>
        <Field label="Author">
          <Input value={book.author} onChange={set("author")} maxLength={200} className="h-9 text-sm" />
        </Field>
      </div>
      <Field label="ISBN (optional)" hint="The number under the barcode, if you have it.">
        <Input value={book.isbn} onChange={set("isbn")} inputMode="numeric" className="h-9 font-mono text-sm sm:max-w-56" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {submits.map((s, i) => (
          <Button key={s.value} value={s.value} size="sm" variant={i === 0 ? "ink" : "line"} disabled={pending || !book.title.trim()}>
            {s.label}
          </Button>
        ))}
        {onCancel && (
          <Button size="sm" type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
