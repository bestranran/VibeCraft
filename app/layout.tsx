import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeCraft Studio",
  description: "Prompt-driven Minecraft-style voxel building editor."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
