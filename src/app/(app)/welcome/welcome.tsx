"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveGenresAction } from "@/app/actions/account";
import { Button, ErrorText } from "@/components/ui";
import { GENRES } from "@/lib/genres";

const NEXT = [
  { href: "/snap", title: "Snap a shelf", body: "The fastest way to catalogue print books." },
  { href: "/import", title: "Import from Goodreads or StoryGraph", body: "Keep your ratings, dates and reviews." },
  { href: "/places", title: "Set up rooms and shelves first", body: "So every book lands in the right place." },
];

export function Welcome({ name }: { name: string | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const finish = (href: string) =>
    start(async () => {
      const res = await saveGenresAction(picked);
      if (res.ok) router.push(href);
      else setError(res.error);
    });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12">
      <header className="flex flex-col gap-3">
        <span className="label">Welcome{name ? `, ${name}` : ""}</span>
        <h1 className="font-serif text-[2.6rem] leading-[1.05] sm:text-[3.2rem]">What do you love to read?</h1>
        <p className="text-[15px] text-ink-2">Pick a few. It shapes suggestions later and you can skip it entirely.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => {
          const on = picked.includes(g);
          return (
            <button
              key={g}
              aria-pressed={on}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== g) : p.length < 12 ? [...p, g] : p))}
              className="rounded-full border border-rule-strong px-3.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {g}
            </button>
          );
        })}
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="label">Then, bring your books</h2>
        <ul className="flex flex-col border-t border-rule">
          {NEXT.map((n, i) => (
            <li key={n.href}>
              <button disabled={pending} onClick={() => finish(n.href)} className="group flex w-full items-center justify-between gap-4 border-b border-rule py-5 text-left">
                <span className="flex items-baseline gap-4">
                  <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-serif text-xl group-hover:underline">{n.title}</span>
                    <span className="text-sm text-ink-3">{n.body}</span>
                  </span>
                </span>
                <span className="text-ink-3 transition-transform group-hover:translate-x-1" aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
        <ErrorText>{error}</ErrorText>
        <Button variant="quiet" className="self-start" disabled={pending} onClick={() => finish("/library")}>
          Skip for now
        </Button>
      </section>
    </div>
  );
}
