import type { ReactNode } from "react";

/** A bookplate frame: the double rule pasted inside a book's front cover. */
export function Bookplate({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full max-w-[26rem] bg-paper-raised p-2 shadow-[0_30px_60px_-30px_rgb(30_28_25/0.35)] ${className}`}>
      <div className="border border-ink/70 p-[3px]">
        <div className="border border-ink/30 px-6 py-9 sm:px-9">{children}</div>
      </div>
    </div>
  );
}
