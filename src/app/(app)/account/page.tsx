import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/account";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { libraryItems } from "@/domain/library";
import { Button, PageHead } from "@/components/ui";
import { plural } from "@/lib/labels";
import { enabledSocialProviders, requireUser } from "@/server/auth";
import { DeleteAccount } from "./delete-account";
import { SignInMethods } from "./sign-in-methods";

export const metadata: Metadata = { title: "Account" };

function Row({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-rule py-7 sm:grid-cols-[13rem_1fr_auto] sm:items-start sm:gap-8">
      <h2 className="font-serif text-xl leading-tight">{title}</h2>
      <div className="flex max-w-lg flex-col gap-2 text-[15px] text-ink-2">{children}</div>
      {aside && <div className="flex shrink-0 sm:justify-end">{aside}</div>}
    </section>
  );
}

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser();
  const books = (await libraryItems(db, user.id)).length;
  const linked = enabledSocialProviders.length
    ? await db.select({ id: account.id, providerId: account.providerId }).from(account).where(and(eq(account.userId, user.id), inArray(account.providerId, enabledSocialProviders)))
    : [];
  const connected = enabledSocialProviders.flatMap((provider) => linked.filter((a) => a.providerId === provider).map((a) => ({ provider, id: a.id })));
  const connectFailed = (await searchParams).connect === "failed";
  return (
    <div className="flex flex-col">
      <PageHead eyebrow="Account" title="Your account" />
      <Row
        title="Signed in"
        aside={
          <form action={signOutAction}>
            <Button variant="line">Sign out</Button>
          </form>
        }
      >
        <p className="text-ink">{user.email}</p>
        <p>Sign-in links go to this address. There is no password to forget.</p>
      </Row>
      {enabledSocialProviders.length > 0 && (
        <Row title="Sign in faster">
          <p>Connect your Google account to sign in with one tap. It works even if it uses a different address.</p>
          <SignInMethods providers={enabledSocialProviders} connected={connected} failed={connectFailed} />
        </Row>
      )}
      <Row
        title="Take it with you"
        aside={
          <a
            href="/api/export"
            download
            className="inline-flex h-10 items-center justify-center rounded-[3px] bg-ink px-4 text-sm font-medium whitespace-nowrap text-paper transition-colors hover:bg-ink/85"
          >
            Download CSV
          </a>
        }
      >
        <p>
          Your library is yours. The export holds {books ? plural(books, "book") : "every book"} with ratings, reviews, read dates, shelves
          and lending, in the Goodreads format that The StoryGraph, Hardcover and Readmoth itself can import.
        </p>
      </Row>
      <Row
        title="Tell us what's off"
        aside={
          <Link href="/feedback?from=/account" className="text-sm text-ink underline underline-offset-4 hover:text-accent">
            Send feedback
          </Link>
        }
      >
        <p>A spine it misread, a screen that confused you, a feature you miss. Every message is read.</p>
      </Row>
      <Row
        title="Privacy"
        aside={
          <Link href="/privacy" className="text-sm text-ink underline underline-offset-4 hover:text-accent">
            Read the privacy note
          </Link>
        }
      >
        <p>What Readmoth stores, where it lives, and who helps run it, on one page.</p>
      </Row>
      <DeleteAccount books={books} />
    </div>
  );
}
