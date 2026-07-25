import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const fontSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const fontMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const fontDisplay = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Forge AI — Unreal Vehicle Studio",
  description: "Generate, refine, and stage AI vehicle models in Unreal Engine."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable} ${fontDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
