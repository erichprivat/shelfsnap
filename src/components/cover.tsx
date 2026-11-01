"use client";

import { useEffect, useRef, useState } from "react";
import { authorSurname, clothFor } from "./binding";

const TITLE_SIZE = { sm: "text-[11px]", md: "text-[15px]", lg: "text-2xl" } as const;

type Props = {
  seed: string;
  title: string;
  authors: string[];
  url: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
};

/** The real cover when we have one; otherwise a typeset cloth cover so missing art never looks broken. */
export function Cover({ seed, title, authors, url, className = "", size = "md" }: Props) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before hydration attaches onError; check once mounted.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth < 20) setFailed(true);
  }, [url]);
  const cloth = clothFor(seed);
  const showImage = url && !failed;
  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-[2px] shadow-book ${className}`}
      style={{ background: cloth.bg, color: cloth.fg }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts; next/image would need every one allow-listed
        <img
          ref={img}
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          // Open Library answers a missing cover with a 1×1 placeholder rather than an error.
          onLoad={(e) => e.currentTarget.naturalWidth < 20 && setFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col justify-between p-[9%]">
          <span className="h-px w-full" style={{ background: cloth.foil }} />
          <span lang="en" className={`font-serif leading-[1.05] ${TITLE_SIZE[size]} line-clamp-5 text-balance break-words hyphens-auto`}>{title}</span>
          <span className="flex flex-col gap-[6%]">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: cloth.foil }}>
              {authorSurname(authors)}
            </span>
            <span className="h-px w-full" style={{ background: cloth.foil }} />
          </span>
        </div>
      )}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 to-transparent" aria-hidden />
    </div>
  );
}
