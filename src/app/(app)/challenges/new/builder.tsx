"use client";

import { useState } from "react";
import { createChallengeAction } from "@/app/actions/challenges";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";
import { category, FREE, randomCard, rerollSquare, THEMES, type ThemeId } from "@/domain/bingo-categories";
import type { ChallengeKind } from "@/db/schema";
import { useAction } from "@/lib/use-action";

const KINDS: { kind: ChallengeKind; title: string; body: string }[] = [
  { kind: "books", title: "Reading goal", body: "Read a number of books in a year." },
  { kind: "bingo", title: "Book bingo", body: "Fill a card of 24 prompts, from “before 1700” to “a book you were given”." },
  { kind: "shelf", title: "Read your shelf", body: "Read books you already owned when it started. No buying your way out." },
];

const DEFAULT_TARGET = { books: 24, shelf: 12, bingo: 0 } as const;

function defaultTitle(kind: ChallengeKind, target: number, year: number, themeName: string) {
  if (kind === "books") return `Read ${target} books in ${year}`;
  if (kind === "shelf") return `Read your shelf: ${target} in ${year}`;
  return `${themeName} ${year}`;
}

export function Builder({ years, initialCard }: { years: number[]; initialCard: string[] }) {
  const [kind, setKind] = useState<ChallengeKind>("bingo");
  const [year, setYear] = useState(years[0]!);
  const [target, setTarget] = useState(24);
  const [themeId, setThemeId] = useState<ThemeId>("classic");
  // Dealt on the server, so the first render matches; shuffles happen here.
  const [card, setCard] = useState(initialCard);
  const [title, setTitle] = useState<string | null>(null);
  const { pending, error, go } = useAction();
  const theme = THEMES.find((t) => t.id === themeId)!;
  const shownTitle = title ?? defaultTitle(kind, target, year, theme.name);

  const pickKind = (k: ChallengeKind) => {
    setKind(k);
    if (k !== "bingo") setTarget(DEFAULT_TARGET[k]);
  };
  const pickTheme = (id: ThemeId) => {
    setThemeId(id);
    setCard(randomCard(id));
  };

  const create = () =>
    go(() =>
      createChallengeAction({
        kind,
        title: shownTitle,
        startsOn: `${year}-01-01`,
        endsOn: `${year}-12-31`,
        target: kind === "bingo" ? null : target,
        card: kind === "bingo" ? card : null,
        theme: kind === "bingo" ? themeId : null,
      }),
    );

  return (
    <div className="flex flex-col gap-10">
      <div role="radiogroup" aria-label="Kind of challenge" className="grid gap-3 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => pickKind(k.kind)}
            className="flex flex-col gap-1.5 border border-rule bg-paper-raised p-4 text-left transition-colors hover:border-rule-strong aria-checked:border-ink aria-checked:shadow-[inset_0_0_0_1px_var(--color-ink)]"
          >
            <span className="font-serif text-xl">{k.title}</span>
            <span className="text-sm text-ink-2">{k.body}</span>
          </button>
        ))}
      </div>

      {kind === "bingo" && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-2xl">Pick a theme</h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.id === themeId}
                  onClick={() => pickTheme(t.id)}
                  className="w-52 shrink-0 border border-rule p-3 text-left transition-colors hover:border-rule-strong aria-pressed:border-accent aria-pressed:bg-accent/[0.06] sm:w-auto sm:max-w-56"
                >
                  <span className="block font-serif text-lg">{t.name}</span>
                  <span className="block text-xs text-ink-3">{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-3">Tap a square to swap it for another. Squares marked “you decide” are on your honour.</p>
            <Button variant="line" size="sm" onClick={() => setCard(randomCard(themeId))}>
              Shuffle card
            </Button>
          </div>
          <BingoPreview card={card} onReroll={(i) => setCard(rerollSquare(card, i, themeId))} />
        </section>
      )}

      <section className="grid max-w-xl gap-4 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Name">
          <Input value={shownTitle} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Year">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        {kind !== "bingo" && (
          <Field label="Books">
            <div className="flex h-10 items-center rounded-[3px] border border-rule-strong">
              <button type="button" aria-label="Fewer" className="h-full px-3 text-ink-2 hover:text-ink" onClick={() => setTarget(Math.max(1, target - 1))}>
                −
              </button>
              <input
                type="number"
                min={1}
                max={1000}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                className="num h-full w-14 bg-transparent text-center text-[15px] [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="Number of books"
              />
              <button type="button" aria-label="More" className="h-full px-3 text-ink-2 hover:text-ink" onClick={() => setTarget(Math.min(1000, target + 1))}>
                +
              </button>
            </div>
          </Field>
        )}
      </section>

      <div className="flex flex-col items-start gap-2">
        <Button variant="accent" size="lg" disabled={pending} onClick={create}>
          {pending ? "Creating…" : "Create challenge"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

function BingoPreview({ card, onReroll }: { card: string[]; onReroll: (square: number) => void }) {
  return (
    <ol className="grid max-w-2xl grid-cols-5 gap-1 sm:gap-1.5">
      {card.map((id, i) => {
        if (id === FREE)
          return (
            <li key={i} className="flex aspect-square items-center justify-center bg-accent/90 p-1 text-center font-serif text-sm text-accent-ink sm:text-lg">
              Free
            </li>
          );
        const c = category(id);
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => onReroll(i)}
              title="Swap this square"
              className="group relative flex aspect-square w-full flex-col items-center justify-center border border-rule bg-paper-raised p-1 text-center transition-colors hover:border-ink"
            >
              <span className="line-clamp-4 text-[9px] leading-tight text-ink sm:text-[12px]">{c?.label}</span>
              {!c?.rule && <span className="mt-0.5 hidden text-[9px] text-ink-3 sm:block">you decide</span>}
              <span className="absolute top-0.5 right-1 text-[10px] text-ink-3 opacity-0 group-hover:opacity-100" aria-hidden>
                ↻
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
