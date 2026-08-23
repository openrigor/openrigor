"use client";

import { useUserContext } from "@/contexts/UserContext";
import { postLoginPath } from "@/lib/teaching/config";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  HeroSection,
  HypothesisSection,
  MeasuresSection,
  ProblemsSection,
  BuildingSection,
  ResearchSection,
  OssSection,
  FinalCtaSection,
} from "./landing-sections";
import { LandingFooter } from "./landing-footer";

const NAV_LINKS = [
  { href: "#canvas", label: "Workspace" },
  { href: "#research", label: "Research" },
  { href: "#open-source", label: "Open source" },
];

function LandingHeader() {
  const { user } = useUserContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const openCanvasHref = user ? postLoginPath(user) : "/auth/login";

  return (
    <header className="site">
      <div className="header-inner">
        <Link className="brand" href="/">
          <Image
            className="brand-mark"
            src="/evaluchat.png"
            alt="evaluchat"
            width={32}
            height={32}
          />
          <span>evaluchat</span>
        </Link>

        <nav className="main" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          {user ? (
            <>
              <Link className="hlink" href="/auth/signout">
                Sign out
              </Link>
            </>
          ) : (
            <Link className="hlink" href="/auth/login">
              Sign in
            </Link>
          )}
          <Link className="nav-cta" href={openCanvasHref}>
            <span>Open Workspace</span>
            <ArrowUpRight width={14} height={14} />
          </Link>
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <X width={22} height={22} />
            ) : (
              <Menu width={22} height={22} />
            )}
          </button>
        </div>
      </div>

      <div className={`mobile-panel${menuOpen ? " open" : ""}`}>
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
            {l.label}
          </a>
        ))}
        {user ? (
          <a href="/auth/signout">Sign out</a>
        ) : (
          <a href="/auth/login">Sign in</a>
        )}
        <a className="nav-cta mcta" href={openCanvasHref}>
          <span>Open Workspace</span>
          <ArrowUpRight width={14} height={14} />
        </a>
      </div>
    </header>
  );
}

export function LandingPage() {
  return (
    <div className="landing">
      <LandingHeader />
      <main>
        <HeroSection />
        <HypothesisSection />
        <MeasuresSection />
        <ProblemsSection />
        <BuildingSection />
        <ResearchSection />
        <OssSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
