import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "ink" | "accent" | "quiet" | "line";
const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[3px] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";
const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4", lg: "h-12 px-6 text-[15px]" };
const variants: Record<Variant, string> = {
  ink: "bg-ink text-paper hover:bg-ink/85",
  accent: "bg-accent text-accent-ink hover:bg-accent/90",
  quiet: "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
  line: "border border-rule-strong text-ink hover:border-ink hover:bg-ink/[0.03]",
};

type BtnProps = { variant?: Variant; size?: keyof typeof sizes };

export function Button({ variant = "ink", size = "md", className = "", ...rest }: ComponentProps<"button"> & BtnProps) {
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}

export function LinkButton({ variant = "ink", size = "md", className = "", ...rest }: ComponentProps<typeof Link> & BtnProps) {
  return <Link className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}

export const inputClass =
  "h-10 w-full rounded-[3px] border border-rule-strong bg-paper-raised px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

export function Input({ className = "", ...rest }: ComponentProps<"input">) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: ComponentProps<"select">) {
  return <select className={`${inputClass} appearance-none bg-[length:10px] bg-[right_12px_center] bg-no-repeat pr-8 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238b8377' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...rest} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-accent">
      {children}
    </p>
  );
}

/** Page title block: an eyebrow, a serif headline and an optional line of context. */
export function PageHead({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b border-rule pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        {eyebrow && <span className="label">{eyebrow}</span>}
        <h1 className="font-serif text-[2.1rem] leading-[1.05] tracking-[-0.01em] text-balance sm:text-[2.6rem]">{title}</h1>
        {children && <div className="max-w-xl text-[15px] text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
