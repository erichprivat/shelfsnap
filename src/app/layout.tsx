import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const display = Newsreader({ variable: "--font-display", subsets: ["latin", "latin-ext"], style: ["normal", "italic"], axes: ["opsz"] });
const ui = Schibsted_Grotesk({ variable: "--font-ui", subsets: ["latin", "latin-ext"] });
const code = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Shelfsnap", template: "%s · Shelfsnap" },
  description: "Your library, beautifully. Snap your shelf and it's catalogued.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eee4" },
    { media: "(prefers-color-scheme: dark)", color: "#15130f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
