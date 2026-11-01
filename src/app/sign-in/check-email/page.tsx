import type { Metadata } from "next";
import Link from "next/link";
import { Bookplate } from "@/components/bookplate";
import { lastDevMagicLink } from "@/server/email";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmail({ searchParams }: PageProps<"/sign-in/check-email">) {
  const { email } = await searchParams;
  const address = typeof email === "string" ? email : "";
  const devLink = address ? lastDevMagicLink(address) : null;
  return (
    <Bookplate>
      <p className="text-center font-serif text-sm italic text-ink-3">Ex libris</p>
      <h1 className="mt-2 text-center font-serif text-3xl">Check your inbox</h1>
      <p className="mt-4 text-center text-[15px] leading-relaxed text-ink-2">
        We sent a sign-in link to <span className="text-ink">{address || "your email"}</span>. It works once and expires in 15
        minutes.
      </p>
      {devLink && (
        <div className="mt-6 border-t border-dashed border-rule-strong pt-5 text-center">
          <p className="label">Development</p>
          <a href={devLink} className="mt-2 inline-block text-sm text-accent underline underline-offset-4">
            Open the sign-in link
          </a>
        </div>
      )}
      <p className="mt-8 text-center text-sm text-ink-3">
        Wrong address?{" "}
        <Link href="/sign-in" className="text-ink-2 underline underline-offset-4 hover:text-ink">
          Start again
        </Link>
      </p>
    </Bookplate>
  );
}
