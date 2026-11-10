import type { ReactNode } from "react";
import { Caveat, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata = {
  title: "Hablamos",
  description: "Spanish speaking practice.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E9E2D2",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${caveat.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
