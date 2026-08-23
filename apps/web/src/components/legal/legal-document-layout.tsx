import NextImage from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BRAND_PANEL_COLOR,
  COPYRIGHT_NOTICE,
  PRIVACY_PATH,
  SUPPORT_EMAIL,
  TERMS_PATH,
} from "@/components/auth/login/login-branding";

type LegalDocumentLayoutProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalDocumentLayout({
  title,
  lastUpdated,
  children,
}: LegalDocumentLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header
        className="text-white shrink-0"
        style={{ backgroundColor: BRAND_PANEL_COLOR }}
      >
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 flex items-center justify-between gap-4">
          <Link
            href="/auth/login"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <NextImage
              src="/evaluchat.png"
              width={40}
              height={40}
              alt="evaluchat"
            />
            <span className="text-xl font-semibold tracking-tight">
              evaluchat
            </span>
          </Link>
          <nav
            className="flex items-center gap-4 text-sm font-medium text-white/80"
            aria-label="Legal"
          >
            <Link
              href={PRIVACY_PATH}
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href={TERMS_PATH}
              className="hover:text-white transition-colors"
            >
              Terms
            </Link>
          </nav>
        </div>
        <div
          className="h-px w-full opacity-40"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
          }}
        />
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">
          Legal
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 mb-2">
          {title}
        </h1>
        <p className="text-sm text-zinc-500 mb-10">
          Last updated · {lastUpdated}
        </p>
        <article className="legal-prose space-y-8 text-[15px] leading-relaxed text-zinc-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_h2]:tracking-tight [&_h2]:mt-2 [&_p]:text-zinc-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-[#2c3e56] [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-zinc-300 hover:[&_a]:decoration-[#2c3e56] [&_strong]:font-semibold [&_strong]:text-zinc-800">
          {children}
        </article>
      </main>

      <footer
        className="shrink-0 text-center text-sm text-white/70 py-8 px-4"
        style={{ backgroundColor: BRAND_PANEL_COLOR }}
      >
        <p className="space-x-2">
          <Link
            href={PRIVACY_PATH}
            className="text-white/85 underline hover:text-white"
          >
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link
            href={TERMS_PATH}
            className="text-white/85 underline hover:text-white"
          >
            Terms
          </Link>
          <span aria-hidden>·</span>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-white/85 underline hover:text-white"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mt-2 text-xs text-white/45 tracking-wide">
          {COPYRIGHT_NOTICE}
        </p>
      </footer>
    </div>
  );
}
