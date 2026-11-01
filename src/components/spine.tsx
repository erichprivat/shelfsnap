import Link from "next/link";
import { authorSurname, clothFor, spineGeometry } from "./binding";

type Props = {
  seed: string;
  title: string;
  authors: string[];
  pageCount: number | null;
  href?: string;
  /** Borrower's name: the book is out, so its slot on the shelf stands empty. */
  lentTo?: string | null;
  overdue?: boolean;
};

/** A book standing on a shelf: cloth colour, foil bands, title running up the spine. */
export function Spine({ seed, title, authors, pageCount, href, lentTo, overdue }: Props) {
  const cloth = clothFor(seed);
  const { width, height, style } = spineGeometry(seed, pageCount);
  const surname = authorSurname(authors);
  const body = lentTo ? (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-dashed transition-colors hover:border-ink hover:text-ink ${overdue ? "border-accent text-accent" : "border-rule-strong text-ink-3"}`}
      style={{ width, height: `${height}%` }}
    >
      <span className="spine-text overflow-hidden text-[10px] font-medium tracking-wide text-ellipsis whitespace-nowrap">{overdue ? `${lentTo} · overdue` : `with ${lentTo}`}</span>
    </span>
  ) : (
    <span
      className="group/spine relative flex shrink-0 flex-col items-center justify-between overflow-hidden rounded-[2px] shadow-book transition-transform duration-200 ease-out hover:-translate-y-1.5"
      style={{
        width,
        height: `${height}%`,
        background: cloth.bg,
        color: cloth.fg,
        boxShadow: "inset 1px 0 0 var(--spine-edge), inset -1px 0 0 var(--spine-edge), var(--shadow-book)",
        backgroundImage:
          "linear-gradient(90deg, rgb(0 0 0 / .18), rgb(255 255 255 / .06) 18%, rgb(0 0 0 / 0) 40%, rgb(0 0 0 / .1) 92%, rgb(0 0 0 / .22))",
      }}
    >
      <span className="mt-2 flex w-full flex-col gap-[3px] px-[3px]" aria-hidden>
        <span className="h-px w-full" style={{ background: cloth.foil, opacity: 0.85 }} />
        {style !== 1 && <span className="h-[3px] w-full" style={{ background: cloth.foil, opacity: 0.7 }} />}
      </span>
      <span className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden py-2">
        <span
          className="spine-text max-h-full overflow-hidden font-serif leading-none tracking-[0.01em] text-ellipsis whitespace-nowrap"
          style={{ fontSize: Math.max(10, Math.min(14, width * 0.42)), fontWeight: style === 2 ? 600 : 500 }}
        >
          {title}
        </span>
      </span>
      <span
        className="spine-text mb-2 max-h-[30%] overflow-hidden text-[9px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: cloth.foil }}
      >
        {surname}
      </span>
    </span>
  );
  const label = `${title}${surname ? ` by ${authors[0]}` : ""}${lentTo ? ` (lent to ${lentTo})` : ""}`;
  return href ? (
    <Link href={href} className="flex h-full items-end" aria-label={label} title={label}>
      {body}
    </Link>
  ) : (
    <span className="flex h-full items-end" aria-label={label} title={label}>
      {body}
    </span>
  );
}
