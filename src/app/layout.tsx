import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local AI Game Table",
  description: "A LAN-hosted AI game table for D&D campaigns and storyteller tabletop RPGs — cinematic scene display with phone controllers."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
