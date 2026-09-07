"use client";

import { useUserContext } from "@/contexts/UserContext";
import { postLoginPath } from "@/lib/teaching/config";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { PreAuthLanguageSwitcher } from "@/components/settings/language-switcher";

function LandingHeader() {
  const t = useTranslations("landing");
  const { user } = useUserContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const openCanvasHref = user ? postLoginPath(user) : "/auth/login";
  const navLinks = [
    { href: "#canvas", label: t("workspace") },
    { href: "#research", label: t("research") },
    { href: "#open-source", label: t("openSource") },
  ];

  return (
    <header className="site">
      <div className="header-inner">
        <Link className="brand" href="/">
          <Image
            className="brand-mark"
            src="/openrigor.png"
            alt="OpenRigor"
            width={32}
            height={32}
          />
          <span>OpenRigor</span>
        </Link>

        <nav className="main" aria-label="Primary">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <PreAuthLanguageSwitcher />
          {user ? (
            <>
              <Link className="hlink" href="/auth/signout">
                {t("signOut")}
              </Link>
            </>
          ) : (
            <Link className="hlink" href="/auth/login">
              {t("signIn")}
            </Link>
          )}
          <Link className="nav-cta" href={openCanvasHref}>
            <span>{t("openWorkspace")}</span>
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
        {navLinks.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
            {l.label}
          </a>
        ))}
        <div className="mobile-language-switcher">
          <PreAuthLanguageSwitcher mobile />
        </div>
        {user ? (
          <a href="/auth/signout">{t("signOut")}</a>
        ) : (
          <a href="/auth/login">{t("signIn")}</a>
        )}
        <a className="nav-cta mcta" href={openCanvasHref}>
          <span>{t("openWorkspace")}</span>
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
