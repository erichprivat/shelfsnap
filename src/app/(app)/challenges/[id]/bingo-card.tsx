"use client";

import { useState } from "react";
import { clearSquareAction, placeBookAction } from "@/app/actions/challenges";
import { Cover } from "@/components/cover";
import { Button, ErrorText } from "@/components/ui";
import { category, FREE } from "@/domain/bingo-categories";
import type { BingoBoard } from "@/domain/challenges";
import { useAction } from "@/lib/use-action";

/** The card: tap a square to put a finished book on it. Books that fit by their data come first. */
export function BingoCard({ challengeId, board, readOnly = false }: { challengeId: string; board: BingoBoard; readOnly?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const { pending, error, go } = useAction();
  const placed = new Map(board.placed.map((p) => [p.square, p]));
  const inLine = new Set(board.lines.flat());
  const active = open !== null ? category(board.card[open]!) : null;
  const fitting = open !== null ? board.candidates.filter((c) => c.fits.includes(open)) : [];
  const others = open !== null ? board.candidates.filter((c) => !c.fits.includes(open)) : [];

  const place = (workId: string) => open !== null && go(() => placeBookAction(challengeId, open, workId), () => setOpen(null));
  const clear = () => open !== null && go(() => clearSquareAction(challengeId, open), () => setOpen(null));

  return (
    <section className="flex flex-col gap-4">
      <ol className="grid max-w-2xl grid-cols-5 gap-1 sm:gap-1.5" aria-label="Bingo card">
        {board.card.map((id, i) => {
          if (id === FREE)
            return (
              <li key={i} className={`flex aspect-square items-center justify-center p-1 text-center font-serif text-sm sm:text-lg ${inLine.has(i) ? "bg-moss text-paper" : "bg-accent/90 text-accent-ink"}`}>
                Free
              </li>
            );
          const c = category(id);
          const p = placed.get(i);
          return (
            <li key={i}>
              <button
                type="button"
                disabled={readOnly}
                aria-pressed={open === i}
                onClick={() => setOpen(open === i ? null : i)}
                className={`relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden border p-1 text-center transition-colors disabled:cursor-default ${
                  inLine.has(i) ? "border-moss" : p ? "border-ink" : "border-rule hover:border-ink"
                } ${open === i ? "ring-2 ring-accent ring-offset-1 ring-offset-paper" : ""} bg-paper-raised`}
              >
                {p ? (
                  <>
                    <Cover seed={p.workId} title={p.title} authors={p.author ? [p.author] : []} url={p.coverUrl} size="sm" className={`absolute inset-0 h-full w-full rounded-none ${p.counts ? "" : "opacity-40"}`} />
                    <span className="absolute inset-x-0 bottom-0 bg-paper/85 px-0.5 py-0.5 text-[8px] leading-tight text-ink sm:text-[10px]">{c?.label}</span>
                  </>
                ) : (
                  <>
                    <span className="line-clamp-4 text-[9px] leading-tight text-ink sm:text-[12px]">{c?.label}</span>
                    {!c?.rule && <span className="mt-0.5 hidden text-[9px] text-ink-3 sm:block">you decide</span>}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {board.lines.length > 0 && <p className="text-sm text-moss">{board.lines.length === 12 ? "Every line. Blackout!" : `Bingo! ${board.lines.length} ${board.lines.length === 1 ? "line" : "lines"} complete.`}</p>}

      {open !== null && active && (
        <div className="flex max-w-2xl flex-col gap-4 border border-rule-strong bg-paper-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="label">{active.rule ? "Square" : "Square · you decide"}</span>
              <span className="font-serif text-xl">{active.label}</span>
            </div>
            <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          {placed.get(open) && (
            <div className="flex items-center justify-between gap-3 border-b border-rule pb-3 text-sm">
              <span>
                On this square: <span className="font-serif">{placed.get(open)!.title}</span>
                {!placed.get(open)!.counts && <span className="text-ink-3"> (its read is outside the challenge dates, so it doesn&apos;t count)</span>}
              </span>
              <Button size="sm" variant="quiet" disabled={pending} onClick={clear}>
                Remove
              </Button>
            </div>
          )}
          {board.candidates.length === 0 ? (
            <p className="text-sm text-ink-2">Books you finish during the challenge show up here. Mark one as read to place it.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {fitting.length > 0 && <Choices title="Fits this square" books={fitting} onPick={place} disabled={pending} />}
              {others.length > 0 && <Choices title={fitting.length ? "Other books you've finished" : active.rule ? "Finished books (none fit by their details, but it's your call)" : "Books you've finished"} books={others} onPick={place} disabled={pending} />}
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </section>
  );
}

function Choices({ title, books, onPick, disabled }: { title: string; books: BingoBoard["candidates"]; onPick: (workId: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{title}</span>
      <ul className="flex flex-col">
        {books.slice(0, 30).map((b) => (
          <li key={b.workId}>
            <button type="button" disabled={disabled} onClick={() => onPick(b.workId)} className="flex w-full items-center gap-3 rounded-[2px] p-1.5 text-left hover:bg-ink/[0.04] disabled:opacity-60">
              <Cover seed={b.workId} title={b.title} authors={b.author ? [b.author] : []} url={b.coverUrl} size="sm" className="w-8 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-[15px]">{b.title}</span>
                {b.author && <span className="truncate text-xs text-ink-3">{b.author}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
