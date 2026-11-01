/** A death's-head hawkmoth: the forewings are open book pages, the skull marks its back. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M14.1 15.9c-2.3.3-4.8 1.6-5.4 3.6 1.9.5 4.3-.6 5.8-2.2zM17.9 15.9c2.3.3 4.8 1.6 5.4 3.6-1.9.5-4.3-.6-5.8-2.2z" fill="var(--accent)" />
      <path d="M13.2 10.1C9.5 8.7 5.1 9.3.9 12.4l1.9 5.3c3.7-1.9 7.6-2.5 10.9-2.1zM18.8 10.1c3.7-1.4 8.1-.8 12.3 2.3l-1.9 5.3c-3.7-1.9-7.6-2.5-10.9-2.1z" fill="currentColor" />
      <path d="M4.4 13.6c2.7-1.3 5.8-1.7 8.3-1.2M27.6 13.6c-2.7-1.3-5.8-1.7-8.3-1.2" stroke="var(--paper)" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.42" />
      <path d="M14.2 15.2h3.6c.2 2.7 0 5.2-.6 6.9-.3.9-.7 1.5-1.2 1.9-.5-.4-.9-1-1.2-1.9-.6-1.7-.8-4.2-.6-6.9z" fill="currentColor" />
      <path d="M14.2 17.9h3.6M14.5 20.4h3" stroke="var(--accent)" strokeWidth="1.1" />
      <path d="M15 8.9 12.6 5.6M17 8.9l2.4-3.3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="16" cy="12.1" rx="3.3" ry="3.6" fill="currentColor" />
      <path d="M16 9.3c1.45 0 2.3.95 2.3 2.3 0 .9-.4 1.5-.95 1.85v.95h-2.7v-.95c-.55-.35-.95-.95-.95-1.85 0-1.35.85-2.3 2.3-2.3z" fill="var(--paper)" />
      <ellipse cx="15.2" cy="11.55" rx="0.62" ry="0.72" fill="currentColor" />
      <ellipse cx="16.8" cy="11.55" rx="0.62" ry="0.72" fill="currentColor" />
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
