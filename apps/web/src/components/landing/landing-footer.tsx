"use client";

import Image from "next/image";
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer>
      <div className="container">
        <div className="foot-grid">
          <div className="foot-brand">
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
            <p>
              Open-source infrastructure for experimenting with AI in education.
            </p>
          </div>
          <div className="foot-col">
            <h4>Platform</h4>
            <a href="#canvas">Workspace</a>
            <a href="#research">Research</a>
            <a
              href="https://knowledge.evaluchat.org/concepts/overview.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Workspace documentation
            </a>
            <a href="#open-source">Open source</a>
          </div>
          <div className="foot-col">
            <h4>About</h4>
            <a href="#about">About</a>
            <a
              href="https://github.com/evaluchat/evaluchat"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a href="/auth/login">Sign in</a>
          </div>
          <div className="foot-col">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="https://status.evaluchat.org">Status</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 evaluchat</span>
        </div>
      </div>
    </footer>
  );
}
