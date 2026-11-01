"use client";

import { useState } from "react";
import { searchBooksAction, type FoundBook } from "@/app/actions/books";
import { commitSnapAction, confirmAllAction, confirmSpineAction, rejectSpineAction, retrySnapAction } from "@/app/actions/snap";
import { Cover } from "@/components/cover";
import { Button, ErrorText, Input, LinkButton } from "@/components/ui";
import type { BoundingBox } from "@/db/schema";
import { useAction } from "@/lib/use-action";
import { plural } from "@/lib/labels";

type Book = { editionId: string; workId: string; title: string; authors: string[]; year: number | null; coverUrl: string | null };
type State = "matched" | "ambiguous" | "unmatched" | "duplicate" | "confirmed" | "rejected";
export type ReviewSpine = { id: string; ordinal: number; rawText: string; state: State; box: BoundingBox | null; chosen: Book | null; candidates: Book[] };

const TONE: Record<State, { label: string; dot: string; text: string }> = {
  matched: { label: "Matched", dot: "bg-ink", text: "text-ink-2" },
  confirmed: { label: "Confirmed", dot: "bg-moss", text: "text-moss" },
  ambiguous: { label: "Which one?", dot: "bg-ochre", text: "text-ochre" },
  unmatched: { label: "Not recognised", dot: "bg-accent", text: "text-accent" },
  duplicate: { label: "You own this already", dot: "bg-ochre", text: "text-ochre" },
  rejected: { label: "Skipped", dot: "bg-ink-3", text: "text-ink-3" },
};

const COMMITTED = {
  added: { label: "Added", dot: "bg-moss", text: "text-moss" },
  skipped: { label: "Not added", dot: "bg-ink-3", text: "text-ink-3" },
};

export function Review({ sessionId, status, error, place, spines }: { sessionId: string; status: string; error: string | null; place: string | null; spines: ReviewSpine[] }) {
  const { pending, error: actionError, go } = useAction();
  const [active, setActive] = useState<number | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const counts = spines.reduce((acc, s) => ({ ...acc, [s.state]: (acc[s.state] ?? 0) + 1 }), {} as Partial<Record<State, number>>);
  const confirmed = counts.confirmed ?? 0;
  const matched = counts.matched ?? 0;
  const open = (counts.ambiguous ?? 0) + (counts.unmatched ?? 0) + (counts.duplicate ?? 0);

  if (status === "failed") {
    return (
      <div className="flex flex-col items-start gap-5 border-l-2 border-accent py-2 pl-6">
        <h1 className="font-serif text-3xl">We couldn&apos;t read that photo</h1>
        <p className="text-ink-2">{error}</p>
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => go(() => retrySnapAction(sessionId))}>
            {pending ? "Trying again…" : "Try again"}
          </Button>
          <LinkButton href="/snap" variant="line">
            Take a new photo
          </LinkButton>
        </div>
        <ErrorText>{actionError}</ErrorText>
      </div>
    );
  }

  const committed = status === "committed";
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b border-rule pb-6">
        <span className="label">{place ?? "Shelf not chosen"}</span>
        <h1 className="font-serif text-[2.2rem] leading-tight sm:text-[2.8rem]">
          {committed ? (added !== null ? `${plural(added, "book")} added` : "Added to your library") : spines.length === 0 ? "No spines found" : `${plural(spines.length, "spine")} found`}
        </h1>
        {!committed && spines.length > 0 && (
          <p className="text-[15px] text-ink-2">
            {matched + confirmed} recognised{open > 0 && <>, {plural(open, "needs", "need")} a look</>}. Nothing is added until you press the button at the bottom.
          </p>
        )}
        {spines.length === 0 && <p className="text-[15px] text-ink-2">Try a closer, straighter photo with the spines filling the frame.</p>}
      </header>

      {spines.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
          <figure className="relative overflow-hidden bg-ink/90 lg:sticky lg:top-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked photo */}
            <img src={`/api/snaps/${sessionId}/photo`} alt="Your shelf" className="block h-auto w-full" />
            {spines.map((s) =>
              s.box ? (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActive(s.ordinal);
                    document.getElementById(`spine-${s.ordinal}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className={`absolute border transition-colors ${active === s.ordinal ? "border-paper bg-paper/20" : "border-paper/50 hover:border-paper"}`}
                  style={{ left: `${s.box.x * 100}%`, top: `${s.box.y * 100}%`, width: `${s.box.w * 100}%`, height: `${s.box.h * 100}%` }}
                  aria-label={`Spine ${s.ordinal + 1}`}
                >
                  <span className={`absolute -top-2.5 left-1/2 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full px-1 font-mono text-[10px] text-paper ${TONE[s.state].dot}`}>
                    {s.ordinal + 1}
                  </span>
                </button>
              ) : null,
            )}
          </figure>

          <ol className="flex flex-col border-t border-rule">
            {spines.map((s) => (
              <SpineRow key={s.id} sessionId={sessionId} spine={s} active={active === s.ordinal} locked={committed} onFocus={() => setActive(s.ordinal)} />
            ))}
          </ol>
        </div>
      )}

      {!committed && spines.length > 0 && (
        <div className="sticky bottom-20 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule-strong bg-paper/95 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0 lg:bottom-0">
          <span className="text-sm text-ink-2">
            <span className="num font-medium text-ink">{confirmed}</span> ready to add
            {matched > 0 && <> · {matched} matched, not yet confirmed</>}
          </span>
          <div className="flex gap-2">
            {matched > 0 && (
              <Button variant="line" disabled={pending} onClick={() => go(() => confirmAllAction(sessionId))}>
                Confirm {matched} {matched === 1 ? "match" : "matches"}
              </Button>
            )}
            <Button
              variant="accent"
              disabled={pending || confirmed === 0}
              onClick={() =>
                go(async () => {
                  const res = await commitSnapAction(sessionId);
                  if (res.ok) setAdded(res.data.added);
                  return res;
                })
              }
            >
              Add {plural(confirmed, "book")}
              {place ? ` to ${place.split(" / ").at(-1)}` : ""}
            </Button>
          </div>
          <ErrorText>{actionError}</ErrorText>
        </div>
      )}
      {committed && (
        <div className="flex gap-2">
          <LinkButton href="/library">See your shelves</LinkButton>
          <LinkButton href="/snap" variant="line">
            Snap the next shelf
          </LinkButton>
        </div>
      )}
    </div>
  );
}

function SpineRow({ sessionId, spine, active, locked, onFocus }: { sessionId: string; spine: ReviewSpine; active: boolean; locked: boolean; onFocus: () => void }) {
  const { pending, error, go } = useAction();
  const [searching, setSearching] = useState(false);
  let tone = TONE[spine.state];
  if (locked) tone = spine.state === "confirmed" ? COMMITTED.added : COMMITTED.skipped;
  const pickable = spine.state === "ambiguous" || spine.state === "unmatched";
  return (
    <li
      id={`spine-${spine.ordinal}`}
      onFocusCapture={onFocus}
      onMouseEnter={onFocus}
      className={`grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-b border-rule py-4 transition-colors sm:grid-cols-[1.5rem_minmax(0,1fr)_auto] ${active ? "bg-ink/[0.03]" : ""} ${spine.state === "rejected" ? "opacity-55" : ""}`}
    >
      <span className="num pt-1 text-right font-mono text-xs text-ink-3">{spine.ordinal + 1}</span>
      <div className="flex min-w-0 flex-col gap-2.5">
        {spine.chosen && !pickable ? (
          <BookLine book={spine.chosen} />
        ) : (
          <span className="font-mono text-[13px] break-words text-ink-2">“{spine.rawText}”</span>
        )}
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
          <span className={`font-medium whitespace-nowrap ${tone.text}`} title={`Read from the spine as “${spine.rawText}”`}>
            {tone.label}
          </span>
        </div>
        {pickable && !locked && (
          <div className="flex flex-col gap-2">
            {spine.candidates.map((c) => (
              <button
                key={c.editionId}
                disabled={pending}
                onClick={() => go(() => confirmSpineAction(sessionId, spine.id, c.editionId))}
                className="rounded-[3px] border border-rule p-2 text-left transition-colors hover:border-ink"
              >
                <BookLine book={c} compact />
              </button>
            ))}
            {searching ? (
              <SpineSearch onPick={(b) => go(() => confirmSpineAction(sessionId, spine.id, b.editionId))} initial={spine.rawText} />
            ) : (
              <button className="self-start text-[13px] text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setSearching(true)}>
                {spine.candidates.length ? "None of these — search" : "Search for it"}
              </button>
            )}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
      {!locked && (
        <div className="col-start-2 flex gap-1 sm:col-start-3 sm:row-start-1 sm:self-start">
          {(spine.state === "matched" || spine.state === "duplicate") && (
            <Button size="sm" variant={spine.state === "duplicate" ? "line" : "ink"} disabled={pending} onClick={() => go(() => confirmSpineAction(sessionId, spine.id))}>
              {spine.state === "duplicate" ? "Add again" : "Confirm"}
            </Button>
          )}
          {spine.state !== "rejected" && (
            <Button size="sm" variant="quiet" disabled={pending} onClick={() => go(() => rejectSpineAction(sessionId, spine.id))} aria-label="Skip this spine">
              Skip
            </Button>
          )}
          {spine.state === "rejected" && spine.chosen && (
            <Button size="sm" variant="quiet" disabled={pending} onClick={() => go(() => confirmSpineAction(sessionId, spine.id))}>
              Undo
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function BookLine({ book, compact }: { book: Book; compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <Cover seed={book.workId} title={book.title} authors={book.authors} url={book.coverUrl} size="sm" className={compact ? "w-8" : "w-10"} />
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

function SpineSearch({ onPick, initial }: { onPick: (b: FoundBook) => void; initial: string }) {
  const [q, setQ] = useState(initial.slice(0, 80));
  const [results, setResults] = useState<FoundBook[] | null>(null);
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(async () => {
            const res = await searchBooksAction(q);
            if (res.ok) setResults(res.data);
            return res;
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 text-sm" aria-label="Search for this book" autoFocus />
        <Button size="sm" variant="line" disabled={pending}>
          {pending ? "…" : "Search"}
        </Button>
      </form>
      {results?.length === 0 && <p className="text-sm text-ink-3">No results. Try fewer words.</p>}
      {results?.map((b) => (
        <button key={b.workId} onClick={() => onPick(b)} className="rounded-[3px] border border-rule p-2 text-left hover:border-ink">
          <BookLine book={b} compact />
        </button>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

