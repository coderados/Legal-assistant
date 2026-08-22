import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Legal Assistant",
  description: "AI-assisted legal research and document drafting for U.S. federal and California law.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Legal Assistant
            </Link>
            <nav className="flex gap-6 text-sm font-medium">
              <Link href="/chat" className="hover:text-zinc-600">Chat</Link>
              <Link href="/draft" className="hover:text-zinc-600">Draft</Link>
              <Link href="/upload" className="hover:text-zinc-600">Sources</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-200 bg-white px-4 py-3 text-center text-xs text-zinc-500">
          Not legal advice. Always consult a licensed attorney.
        </footer>
      </body>
    </html>
  );
}
