import { PlateLayout } from "@/components/plate-layout";

export default function JoinLayout({ children }: LayoutProps<"/join/[code]">) {
  return <PlateLayout>{children}</PlateLayout>;
}
