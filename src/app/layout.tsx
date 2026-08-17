import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tactician",
  description: "Browser tactical manager — build a squad, write its doctrine, watch it fight, read why it lost.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
