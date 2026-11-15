"use client";

import { useEffect, useRef, useState } from "react";
import { clearStatusAction, setStatusAction } from "@/app/actions/books";
import type { ReadingStatus } from "@/db/schema";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/labels";
import { useAction } from "@/lib/use-action";

/** Moves a book to a status, or stops tracking it with null. */
export function changeStatus(workId: string, next: ReadingStatus | null) {
  return next ? setStatusAction(workId, next) : clearStatusAction(workId);
}

/** The status list itself, shared by the pill menu and the reading board. */
export function StatusOptions({ current, onPick, disabled }: { current: ReadingStatus | null; onPick: (s: ReadingStatus | null) => void; disabled?: boolean }) {
  return (
    <ul role="menu" className="flex flex-col py-1">
      {STATUS_ORDER.map((s) => (
        <li key={s} role="none">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={current === s}
            disabled={disabled}
            onClick={() => onPick(s)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink aria-checked:text-ink disabled:opacity-60"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${current === s ? "bg-accent" : "bg-transparent"}`} aria-hidden />
            {STATUS_LABEL[s]}
          </button>
        </li>
      ))}
      {current && (
        <li role="none" className="mt-1 border-t border-rule pt-1">
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => onPick(null)}
            className="w-full px-3 py-1.5 pl-[1.6rem] text-left text-[13px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-60"
          >
            Stop tracking
          </button>
        </li>
      )}
    </ul>
  );
}

/** A small status pill that opens a menu, so a book can change status without opening its page. */
export function StatusMenu({ workId, status, className = "" }: { workId: string; status: ReadingStatus | null; className?: string }) {
  const [open, setOpen] = useState(false);
  // What the reader just picked, shown until the server's answer comes back with the page.
  const [picked, setPicked] = useState<{ status: ReadingStatus | null } | null>(null);
  const shown = picked ? picked.status : status;
  const { pending, error, go } = useAction();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (next: ReadingStatus | null) => {
    setOpen(false);
    if (next === shown) return;
    setPicked({ status: next });
    go(async () => {
      const res = await changeStatus(workId, next);
      if (!res.ok) setPicked(null);
      return res;
    });
  };

  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen(!open)}
        title={error ?? "Change status"}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:border-ink hover:text-ink disabled:opacity-60 ${error ? "border-accent text-accent" : shown ? "border-rule-strong text-ink-2" : "border-dashed border-rule-strong text-ink-3"}`}
      >
        {shown ? STATUS_LABEL[shown] : "Set status"}
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="opacity-60">
          <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-40 rounded-[3px] border border-rule-strong bg-paper-raised shadow-lg">
          <StatusOptions current={shown} onPick={pick} disabled={pending} />
        </div>
      )}
    </div>
  );
}
