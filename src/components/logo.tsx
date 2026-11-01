/** A moth whose upper wings are the open pages of a book; the body is the spine. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M15 20.2c-2.6.1-6.2 1.6-6.9 4.3-.4 1.5 1 2.4 2.6 1.8 2.2-.9 3.9-2.9 4.3-4.8zM17 20.2c2.6.1 6.2 1.6 6.9 4.3.4 1.5-1 2.4-2.6 1.8-2.2-.9-3.9-2.9-4.3-4.8z" fill="currentColor" opacity="0.72" />
      <path d="M15 9.2C12 7 7.2 5.9 2.2 6.4l1.9 12.4c4.1-.8 8 0 10.9 1.8z" fill="currentColor" />
      <path d="M17 9.2c3-2.2 7.8-3.3 12.8-2.8l-1.9 12.4c-4.1-.8-8 0-10.9 1.8z" fill="currentColor" />
      <path d="M5.3 10.6c3-.3 5.9.3 7.8 1.5M5.8 14c2.8-.3 5.5.3 7.3 1.4M26.7 10.6c-3-.3-5.9.3-7.8 1.5M26.2 14c-2.8-.3-5.5.3-7.3 1.4" stroke="var(--paper)" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.5" />
      <rect x="15" y="7.6" width="2" height="15.6" rx="1" fill="var(--accent)" />
      <path d="M15.6 8c-.5-2.3-1.8-3.8-3.7-4.4M16.4 8c.5-2.3 1.8-3.8 3.7-4.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark className="h-7 w-7" />
      <span className="font-serif text-[1.35rem] italic leading-none tracking-[-0.01em]">Readmoth</span>
    </span>
  );
}
