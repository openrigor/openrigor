"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function LandingFooter() {
  const t = useTranslations("landing");
  return (
    <footer>
      <div className="container">
        <div className="foot-grid">
          <div className="foot-brand">
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
            <p>{t("footerTagline")}</p>
          </div>
          <div className="foot-col">
            <h4>{t("platform")}</h4>
            <a href="#canvas">{t("workspace")}</a>
            <a href="#research">{t("research")}</a>
            <a
              href="https://knowledge.openrigor.org/concepts/overview.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("workspaceDocumentation")}
            </a>
            <a href="#open-source">{t("openSource")}</a>
          </div>
          <div className="foot-col">
            <h4>{t("about")}</h4>
            <a href="#about">{t("about")}</a>
            <a
              href="https://github.com/openrigor/openrigor"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("github")}
            </a>
            <a href="/auth/login">{t("signIn")}</a>
          </div>
          <div className="foot-col">
            <Link href="/privacy">{t("privacy")}</Link>
            <Link href="/terms">{t("terms")}</Link>
            <a href="https://status.evaluchat.org">{t("status")}</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>{t("copyright")}</span>
        </div>
      </div>
    </footer>
  );
}
