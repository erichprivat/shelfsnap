import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { Welcome } from "./welcome";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  return <Welcome name={user.name && !user.name.includes("@") ? user.name.split(" ")[0]! : null} />;
}
