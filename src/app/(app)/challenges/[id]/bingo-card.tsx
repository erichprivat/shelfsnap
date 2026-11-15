"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { searchBooksAction, type FoundBook } from "@/app/actions/books";
import { clearSquareAction, placeBookAction } from "@/app/actions/challenges";
import { Cover } from "@/components/cover";
import { Mark } from "@/components/logo";
import { Button, ErrorText, Input } from "@/components/ui";
import { category, categoryTheme, FREE, type ThemeId } from "@/domain/bingo-categories";
import type { BingoBoard, BingoCandidate } from "@/domain/challenges";
import { useAction } from "@/lib/use-action";

/** Each theme tints its squares, so a card reads like a patchwork rather than a spreadsheet. */
const HUE: Record<ThemeId, number> = { classic: 30, time: 38, world: 205, genre: 275, size: 145, shelves: 18, voices: 340 };

export const squareTint = (id: string): CSSProperties => {
  const theme = categoryTheme(id);
  if (!theme) return {};
  const h = HUE[theme];
  return { backgroundColor: `hsl(${h} 55% 50% / 0.11)`, borderColor: `hsl(${h} 45% 50% / 0.38)` };
};

/** A small, fixed tilt per square, so placed covers look stuck on by hand. */
const tilt = (i: number) => `rotate(${(((i * 37) % 7) - 3) * 0.7}deg)`;

/** Smaller cards stay compact instead of blowing three squares up to full width. */
export const CARD_WIDTH: Record<number, string> = { 3: "max-w-sm", 4: "max-w-lg", 5: "max-w-2xl" };

const LABEL_SIZE: Record<number, string> = { 3: "text-[12px] sm:text-[15px]", 4: "text-[10px] sm:text-[13px]", 5: "text-[9px] sm:text-[12px]" };

type Dragged = { workId: string; fits: number[] };

/** The card: tap a square to put a book on it, or drag a book from the tray. Finished books get stamped. */
export function BingoCard({ challengeId, board, readOnly = false }: { challengeId: string; board: BingoBoard; readOnly?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  const { pending, error, go } = useAction();
  const placed = new Map(board.placed.map((p) => [p.square, p]));
  const inLine = new Set(board.lines.flat());
  const celebrate = useCelebration(board.lines.length);

  const place = (square: number, workId: string) => go(() => placeBookAction(challengeId, square, workId), () => setOpen(null));
  const clear = (square: number) => go(() => clearSquareAction(challengeId, square), () => setOpen(null));

  return (
    <section className="flex flex-col gap-5">
      <div className={`relative ${CARD_WIDTH[board.size]}`}>
        <ol
          className="grid gap-1.5 rounded-[6px] border border-rule-strong bg-paper-sunk p-1.5 shadow-book sm:gap-2 sm:p-2.5"
          style={{ gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))` }}
          aria-label="Bingo card"
        >
          {board.card.map((id, i) => {
            if (id === FREE) return <FreeSquare key={i} inLine={inLine.has(i)} />;
            const c = category(id);
            const p = placed.get(i);
            const fitsDrag = dragged?.fits.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={readOnly}
                  aria-pressed={open === i}
                  aria-label={p ? `${c?.label}: ${p.title}${p.counts ? "" : " (planned)"}` : c?.label}
                  onClick={() => setOpen(open === i ? null : i)}
                  onDragOver={(e) => {
                    if (!dragged || readOnly) return;
                    e.preventDefault();
                    setDropOn(i);
                  }}
                  onDragLeave={() => setDropOn((d) => (d === i ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const workId = e.dataTransfer.getData("text/plain") || dragged?.workId;
                    setDropOn(null);
                    setDragged(null);
                    if (workId) place(i, workId);
                  }}
                  style={p ? undefined : squareTint(id)}
                  className={`group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-[4px] border p-1 text-center transition-all duration-150 disabled:cursor-default ${
                    inLine.has(i) ? "border-moss shadow-[0_0_0_2px_var(--moss)]" : p ? "border-transparent" : "hover:-translate-y-0.5 hover:shadow-md"
                  } ${open === i ? "ring-2 ring-accent ring-offset-2 ring-offset-paper-sunk" : ""} ${dropOn === i ? "scale-[1.04] ring-2 ring-offset-1 ring-offset-paper-sunk " + (fitsDrag ? "ring-moss" : "ring-ink-3") : ""} ${
                    dragged && fitsDrag && !p ? "animate-pulse" : ""
                  }`}
                >
                  {p ? <PlacedBook square={i} book={p} label={c?.label ?? ""} /> : <EmptySquare label={c?.label ?? ""} judged={!c?.rule} size={board.size} />}
                </button>
              </li>
            );
          })}
        </ol>
        {celebrate && <Celebration lines={board.lines.length} total={2 * board.size + 2} />}
      </div>

      <Legend lines={board.lines.length} total={2 * board.size + 2} />

      {open !== null && !readOnly && (
        <SquarePicker
          square={open}
          label={category(board.card[open]!)?.label ?? ""}
          judged={!category(board.card[open]!)?.rule}
          placed={placed.get(open) ?? null}
          finished={board.finished}
          planned={board.planned}
          pending={pending}
          onPick={(workId) => place(open, workId)}
          onClear={() => clear(open)}
          onClose={() => setOpen(null)}
        />
      )}

      {!readOnly && (
        <Tray
          finished={board.finished}
          planned={board.planned}
          onDragStart={(b) => setDragged({ workId: b.workId, fits: b.fits })}
          onDragEnd={() => {
            setDragged(null);
            setDropOn(null);
          }}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}

function FreeSquare({ inLine }: { inLine: boolean }) {
  return (
    <li
      className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[4px] p-1 text-center ${inLine ? "bg-moss text-paper" : "bg-accent text-accent-ink"}`}
      style={{ backgroundImage: "radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.18), transparent 55%)" }}
    >
      <Mark className="h-1/3 w-1/3 opacity-90" />
      <span className="font-serif text-[11px] italic sm:text-base">Free</span>
    </li>
  );
}

function EmptySquare({ label, judged, size }: { label: string; judged: boolean; size: number }) {
  return (
    <>
      <span className={`line-clamp-4 leading-tight text-ink ${LABEL_SIZE[size]}`}>{label}</span>
      {judged && <span className="mt-0.5 hidden text-[9px] text-ink-3 italic sm:block">you decide</span>}
      <span className="pointer-events-none absolute right-1 bottom-0.5 text-[11px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
        +
      </span>
    </>
  );
}

function PlacedBook({ square, book, label }: { square: number; book: BingoBoard["placed"][number]; label: string }) {
  return (
    <>
      <div className="absolute inset-[6%] transition-transform duration-200 group-hover:scale-[1.03]" style={{ transform: tilt(square) }}>
        <Cover
          seed={book.workId}
          title={book.title}
          authors={book.author ? [book.author] : []}
          url={book.coverUrl}
          size="sm"
          className={`h-full w-full ${book.counts ? "" : "opacity-45 grayscale"}`}
        />
      </div>
      {book.counts ? (
        <span
          className="bingo-stamp pointer-events-none absolute top-[8%] right-[8%] flex aspect-square w-[42%] items-center justify-center rounded-full border-2 border-accent bg-accent/25 font-serif text-[9px] font-semibold tracking-wide text-accent uppercase sm:text-[11px]"
          aria-hidden
        >
          Read
        </span>
      ) : (
        <span className="pointer-events-none absolute top-[6%] right-[6%] rotate-3 rounded-[2px] border border-dashed border-ink-3 bg-paper/90 px-1 text-[8px] text-ink-2 italic sm:text-[10px]" aria-hidden>
          planned
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-paper/85 px-0.5 py-0.5 text-[8px] leading-tight text-ink backdrop-blur-[1px] sm:text-[10px]">{label}</span>
    </>
  );
}

function Legend({ lines, total }: { lines: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-accent bg-accent/25" /> Read, counts
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-[2px] border border-dashed border-ink-3" /> Planned, counts once you finish it
      </span>
      {lines > 0 && (
        <span className="font-medium text-moss">
          {lines === total ? "Every line. Blackout!" : `Bingo × ${lines}`}
        </span>
      )}
    </div>
  );
}

/** True for a moment after a line is completed, not on first load. */
function useCelebration(lines: number) {
  const seen = useRef(lines);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (lines <= seen.current) {
      seen.current = lines;
      return;
    }
    seen.current = lines;
    // Celebrating is a response to the server's answer, which arrives as new props.
    setOn(true);
    const t = setTimeout(() => setOn(false), 2200);
    return () => clearTimeout(t);
  }, [lines]);
  return on;
}

const CONFETTI = ["var(--accent)", "var(--moss)", "var(--ochre)", "hsl(205 60% 55%)", "hsl(275 50% 60%)", "hsl(340 60% 60%)"];

function Celebration({ lines, total }: { lines: number; total: number }) {
  const pieces = Array.from({ length: 36 }, (_, i) => {
    const angle = (i / 36) * Math.PI * 2;
    const dist = 120 + ((i * 53) % 90);
    return {
      key: i,
      style: {
        background: CONFETTI[i % CONFETTI.length],
        "--dx": `${Math.cos(angle) * dist}px`,
        "--dy": `${Math.sin(angle) * dist - 40}px`,
        "--rot": `${(i * 97) % 720}deg`,
        animationDelay: `${(i % 6) * 25}ms`,
      } as CSSProperties,
    };
  });
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
      {pieces.map((p) => (
        <span key={p.key} className="bingo-confetti absolute h-2 w-1.5 rounded-[1px]" style={p.style} />
      ))}
      <span className="bingo-banner rounded-[4px] border-2 border-moss bg-paper px-5 py-2 font-serif text-3xl text-moss shadow-book sm:text-5xl">
        {lines === total ? "Blackout!" : "Bingo!"}
      </span>
    </div>
  );
}

function SquarePicker({
  square,
  label,
  judged,
  placed,
  finished,
  planned,
  pending,
  onPick,
  onClear,
  onClose,
}: {
  square: number;
  label: string;
  judged: boolean;
  placed: BingoBoard["placed"][number] | null;
  finished: BingoCandidate[];
  planned: BingoCandidate[];
  pending: boolean;
  onPick: (workId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const fits = (b: BingoCandidate) => b.fits.includes(square);
  const finishedFit = finished.filter(fits);
  const plannedFit = planned.filter(fits);
  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-[4px] border border-rule-strong bg-paper-raised p-4 shadow-book">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="label">{judged ? "Square · you decide" : "Square"}</span>
          <span className="font-serif text-2xl leading-tight">{label}</span>
        </div>
        <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={onClose}>
          Close
        </button>
      </div>
      {placed && (
        <div className="flex items-center justify-between gap-3 border-b border-rule pb-3 text-sm">
          <span>
            On this square: <span className="font-serif">{placed.title}</span>
            <span className="text-ink-3">{placed.counts ? " · read, counts" : " · planned, counts once you finish it during the challenge"}</span>
          </span>
          <Button size="sm" variant="quiet" disabled={pending} onClick={onClear}>
            Take it off
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {finishedFit.length > 0 && <Choices title="Read, and it fits" tone="moss" books={finishedFit} onPick={onPick} disabled={pending} />}
        {plannedFit.length > 0 && <Choices title="Fits, still to read" books={plannedFit} onPick={onPick} disabled={pending} />}
        {finished.length > finishedFit.length && (
          <Choices title={finishedFit.length ? "Other books you've read" : judged ? "Books you've read" : "Books you've read (none fit by their details, but it's your call)"} books={finished.filter((b) => !fits(b))} onPick={onPick} disabled={pending} />
        )}
        {planned.length > plannedFit.length && <Choices title="Pencil in from your library" books={planned.filter((b) => !fits(b))} onPick={onPick} disabled={pending} collapsed />}
        <Search onPick={onPick} disabled={pending} />
      </div>
    </div>
  );
}

function Choices({ title, books, onPick, disabled, tone, collapsed = false }: { title: string; books: BingoCandidate[]; onPick: (workId: string) => void; disabled: boolean; tone?: "moss"; collapsed?: boolean }) {
  const [all, setAll] = useState(!collapsed);
  const shown = all ? books.slice(0, 40) : books.slice(0, 6);
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`label ${tone === "moss" ? "text-moss" : ""}`}>{title}</span>
      <ul className="grid gap-1 sm:grid-cols-2">
        {shown.map((b) => (
          <li key={b.workId}>
            <button type="button" disabled={disabled} onClick={() => onPick(b.workId)} className="flex w-full items-center gap-3 rounded-[3px] p-1.5 text-left hover:bg-ink/[0.05] disabled:opacity-60">
              <Cover seed={b.workId} title={b.title} authors={b.author ? [b.author] : []} url={b.coverUrl} size="sm" className="w-8 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-[15px]">{b.title}</span>
                {b.author && <span className="truncate text-xs text-ink-3">{b.author}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {books.length > shown.length && (
        <button type="button" className="self-start text-xs text-ink-3 underline-offset-4 hover:text-ink hover:underline" onClick={() => setAll(true)}>
          Show {books.length - shown.length} more
        </button>
      )}
    </div>
  );
}

/** Pencil in a book that isn't in the library yet. */
function Search({ onPick, disabled }: { onPick: (workId: string) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundBook[] | null>(null);
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-3">
      <span className="label">Or find any book</span>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(async () => {
            const res = await searchBooksAction(q);
            if (res.ok) setFound(res.data);
            return res;
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or author" className="h-9 text-sm" />
        <Button size="sm" variant="line" disabled={pending || q.trim().length < 2}>
          {pending ? "Looking…" : "Search"}
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {found && found.length === 0 && <p className="text-sm text-ink-3">Nothing found.</p>}
      {found && found.length > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {found.slice(0, 8).map((b) => (
            <li key={b.workId}>
              <button type="button" disabled={disabled} onClick={() => onPick(b.workId)} className="flex w-full items-center gap-3 rounded-[3px] p-1.5 text-left hover:bg-ink/[0.05] disabled:opacity-60">
                <Cover seed={b.workId} title={b.title} authors={b.authors} url={b.coverUrl} size="sm" className="w-8 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-serif text-[15px]">{b.title}</span>
                  <span className="truncate text-xs text-ink-3">{[b.authors[0], b.year].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Your books as covers to drag onto the card (desktop); on a phone, tap a square instead. */
function Tray({ finished, planned, onDragStart, onDragEnd }: { finished: BingoCandidate[]; planned: BingoCandidate[]; onDragStart: (b: BingoCandidate) => void; onDragEnd: () => void }) {
  const [tab, setTab] = useState<"finished" | "planned">(finished.length ? "finished" : "planned");
  const books = tab === "finished" ? finished : planned;
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex gap-1 text-[13px]" role="tablist">
          {(["finished", "planned"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className="rounded-full border border-transparent px-3 py-1 text-ink-2 hover:text-ink aria-selected:border-ink aria-selected:text-ink"
            >
              {t === "finished" ? `Read (${finished.length})` : `To read (${planned.length})`}
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-ink-3 sm:inline">Drag a cover onto a square</span>
      </div>
      {books.length === 0 ? (
        <p className="text-sm text-ink-3">{tab === "finished" ? "Books you finish during the challenge land here." : "Nothing left in your library to plan with."}</p>
      ) : (
        <ul className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pt-1 pb-2">
          {books.slice(0, 60).map((b, i) => (
            <li key={b.workId} className="w-14 shrink-0 sm:w-16">
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", b.workId);
                  e.dataTransfer.effectAllowed = "copy";
                  onDragStart(b);
                }}
                onDragEnd={onDragEnd}
                title={`${b.title}${b.fits.length ? ` · fits ${b.fits.length} square${b.fits.length === 1 ? "" : "s"}` : ""}`}
                className="relative cursor-grab transition-transform hover:-translate-y-1 active:cursor-grabbing"
                style={{ transform: tilt(i) }}
              >
                <Cover seed={b.workId} title={b.title} authors={b.author ? [b.author] : []} url={b.coverUrl} size="sm" className={tab === "planned" ? "opacity-80" : ""} />
                {b.fits.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-moss px-1 text-[9px] font-semibold text-paper" aria-hidden>
                    {b.fits.length}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
