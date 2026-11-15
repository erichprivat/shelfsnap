"use client";

import { useState } from "react";

const SOURCE = { openlibrary: "Open Library", googlebooks: "Google Books" } as const;

/** The blurb, clamped until asked for; long community descriptions would push everything else down. */
export function Description({ text, source }: { text: string; source: keyof typeof SOURCE | null }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div className="flex max-w-prose flex-col gap-2 border-t border-rule pt-5">
      <p className={`text-[15px] leading-relaxed whitespace-pre-line text-ink-2 ${long && !open ? "line-clamp-6" : ""}`}>{text}</p>
      <div className="flex items-baseline gap-4 text-xs text-ink-3">
        {long && (
          <button type="button" onClick={() => setOpen(!open)} className="underline decoration-rule-strong underline-offset-4 hover:text-ink">
            {open ? "Less" : "More"}
          </button>
        )}
        {source && <span>From {SOURCE[source]}</span>}
      </div>
    </div>
  );
}
