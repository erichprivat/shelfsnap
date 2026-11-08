import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bookplate } from "@/components/bookplate";
import { signupsAreInviteOnly } from "@/server/access";
import { enabledSocialProviders, getSession } from "@/server/auth";
import { MagicLinkForm, SocialButtons } from "./forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSession()) redirect("/library");
  return (
    <Bookplate>
      <p className="text-center font-serif text-sm italic text-ink-3">Ex libris</p>
      <h1 className="mt-2 text-center font-serif text-3xl leading-tight">Sign in to your library</h1>
      <p className="mt-3 text-center text-sm text-ink-2">
        {signupsAreInviteOnly() ? "Readmoth is invite-only during the beta. Invited? The same link creates your account." : "New here? The same link creates your account."}
      </p>
      <div className="mt-8 flex flex-col gap-5">
        <MagicLinkForm />
        {enabledSocialProviders.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-xs text-ink-3">
              <span className="h-px flex-1 bg-rule" />
              or
              <span className="h-px flex-1 bg-rule" />
            </div>
            <SocialButtons providers={enabledSocialProviders} />
          </>
        )}
      </div>
    </Bookplate>
  );
}
