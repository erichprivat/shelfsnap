export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="6" width="4" height="15" rx="0.6" fill="currentColor" />
      <rect x="8.5" y="3" width="5" height="18" rx="0.6" fill="var(--accent)" />
      <rect x="15" y="8" width="3.4" height="13" rx="0.6" fill="currentColor" transform="rotate(-9 16.7 21)" />
      <rect x="2" y="21.2" width="20" height="1.3" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark className="h-6 w-6" />
      <span className="font-serif text-[1.35rem] italic leading-none tracking-[-0.01em]">Shelfsnap</span>
    </span>
  );
}
