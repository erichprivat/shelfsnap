import { signOutAction } from "@/app/actions/account";
import { MobileNav, SideNav } from "@/components/nav";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh">
      <SideNav email={user.email} signOut={signOutAction} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-8 lg:px-12 lg:pt-12 lg:pb-16">{children}</main>
      </div>
    </div>
  );
}
