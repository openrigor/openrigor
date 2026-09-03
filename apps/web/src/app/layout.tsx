import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenRigor — Open-source research infrastructure",
  description:
    "An open-source, Markdown-native workspace for research that tracks and collates digital artifacts. Methods, evidence, and provenance stay inspectable from question to finding.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-screen">
      <body className={cn("min-h-full", inter.className)}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
