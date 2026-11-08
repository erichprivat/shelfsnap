import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/logo";

export const metadata: Metadata = { title: "Privacy" };

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-rule py-8 sm:grid-cols-[12rem_1fr] sm:gap-10">
      <h2 className="font-serif text-xl leading-tight">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2 [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 sm:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <Link href="/library" className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          Your library
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-8">
        <div className="flex flex-col gap-3 pb-10">
          <span className="label">Privacy · updated 8 November 2026</span>
          <h1 className="font-serif text-[2.6rem] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[3.2rem]">
            What Readmoth keeps, and why.
          </h1>
          <p className="max-w-xl text-lg text-ink-2">
            Readmoth catalogues your books. It needs to know about your books and how to email you, and nothing else. No ads, no tracking, no
            selling data.
          </p>
        </div>

        <Part title="What's stored">
          <p>
            <strong>Your email address</strong>, to send sign-in links. <strong>Your library</strong>: the books you add, your rooms and
            shelves, reading status, dates, ratings, reviews, lists, and the names you type when you lend a book out.{" "}
            <strong>Shelf photos</strong> you snap, only while you check what was read: each photo is deleted as soon as you add the books, or
            after seven days if you never finish. <strong>Feedback</strong> you send.
          </p>
          <p>
            To keep you signed in, Readmoth sets one cookie and stores the browser and IP address of each sign-in. To keep the free snap
            limit fair, it counts how many snaps you make each month.
          </p>
        </Part>

        <Part title="Where it lives">
          <p>
            On one server in Stockholm, run by <strong>Fly.io</strong>. The disk is encrypted and backed up daily; backups are kept for
            five days.
          </p>
        </Part>

        <Part title="Who else sees what">
          <p>
            <strong>Anthropic</strong> reads the spines in your shelf photos. The photo is sent to its API for that one task, under terms
            that don&apos;t allow it to be used for training models.
          </p>
          <p>
            <strong>Resend</strong> sends the sign-in emails, from its servers in Ireland. It sees your email address.
          </p>
          <p>
            <strong>Open Library</strong> (the Internet Archive) is the book catalogue. Readmoth&apos;s server looks titles and ISBNs up
            there without saying who&apos;s asking; book covers load straight from Open Library, so your browser does connect to it.
          </p>
          <p>Lists you choose to share can be read by anyone with the link, until you stop sharing them.</p>
        </Part>

        <Part title="Your choices">
          <p>
            <strong>Take it with you.</strong> Account → Download CSV exports your whole library in a format The StoryGraph, Hardcover
            and Goodreads-compatible tools can import.
          </p>
          <p>
            <strong>Delete it.</strong> Account → Delete account removes your library, any photos still waiting for review and your sign-in details immediately. Copies in
            backups disappear within five days. Shared book records (titles, authors, covers) stay, since they belong to the catalogue,
            not to you.
          </p>
          <p>
            Questions about your data? Use <Link href="/feedback?from=/privacy" className="text-ink underline underline-offset-4 hover:text-accent">Send feedback</Link>{" "}
            once you&apos;re signed in, or email <a href="mailto:hello@readmoth.app" className="text-ink underline underline-offset-4 hover:text-accent">hello@readmoth.app</a>.
          </p>
        </Part>
      </main>
    </div>
  );
}
