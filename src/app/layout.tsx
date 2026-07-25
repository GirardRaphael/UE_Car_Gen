import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge AI — Unreal Vehicle Studio",
  description: "Generate, refine, and stage AI vehicle models in Unreal Engine."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
