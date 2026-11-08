import Link from "next/link";
import { Wordmark } from "@/components/logo";

export default function SignInLayout({ children }: LayoutProps<"/sign-in">) {
  return (
    <div className="grain flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl px-4 py-6 sm:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-xs text-ink-3 sm:px-8">
        <Link href="/privacy" className="hover:text-ink">
          What Readmoth stores about you
        </Link>
      </footer>
    </div>
  );
}
