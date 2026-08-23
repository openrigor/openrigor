import Link from "next/link";
import {
  LEGAL_OPERATOR_NAME,
  SUPPORT_EMAIL,
  TERMS_PATH,
} from "@/components/auth/login/login-branding";

export function PrivacyPolicyContent() {
  return (
    <>
      <section className="space-y-3">
        <p>
          This Privacy Policy explains how evaluchat (“we”, “us”) collects,
          uses, and shares personal data when you visit our websites, create an
          account, or use the evaluchat teaching Service (chat coaching, writing
          canvas, and related teacher tools).
        </p>
        <p>
          It is written in plain language for teachers, students, and reviewers.
          It is not a substitute for legal advice.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Who we are</h2>
        <p>
          Evaluchat is the trading name of{" "}
          <strong>{LEGAL_OPERATOR_NAME}</strong>. For privacy requests, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <p>
          We do not currently have an EU establishment or an Article 27 GDPR
          representative. We intend to incorporate in the EU when commercial
          conditions allow; until then, contact us at the email above.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Roles</h2>
        <ul>
          <li>
            <strong>Evaluchat</strong> is the controller for account data,
            Service usage data, assignment chat and canvas content we store to
            operate the product, and aggregated process-evidence metrics shown
            to teachers.
          </li>
          <li>
            When a teacher invites students into a class or assignment, that
            teacher (or their institution) may also be a controller for
            classroom personal data they choose to put into the Service. We
            process that data to provide evaluchat under their instructions and
            our <Link href={TERMS_PATH}>Terms of Service</Link>.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account identity</strong> — email address, authentication
            identifiers, and role metadata (for example teacher or student) via
            our auth provider (self-hosted Supabase).
          </li>
          <li>
            <strong>Assignment content</strong> — chat messages with the writing
            coach, canvas drafts and revisions, and related assignment metadata.
          </li>
          <li>
            <strong>Process-evidence metrics</strong> — aggregated engagement
            signals such as keystroke cadence, paste/burst patterns, and focus
            timing. We store compact session summaries for teachers, not raw
            keystroke streams to our API.
          </li>
          <li>
            <strong>Support and leads</strong> — messages you send to{" "}
            {SUPPORT_EMAIL} or through early-access / contact forms.
          </li>
          <li>
            <strong>Technical logs</strong> — standard server and edge logs (for
            example IP address, user agent, requested URL) for security,
            reliability, and abuse prevention.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>AI providers and model training</h2>
        <p>
          To coach writing and generate or edit canvas content, we send relevant
          prompts, dialogue, and document excerpts to third-party AI providers.
          Traffic is typically routed through <strong>OpenRouter</strong>. Our
          default budget models are <strong>DeepSeek-class</strong> and similar
          low-cost models.
        </p>
        <p>
          <strong>
            Those third-party providers may use inputs and outputs to improve or
            train their models
          </strong>{" "}
          according to their own terms, unless a no-training routing is
          selected. Today’s budget default does <em>not</em> guarantee a
          no-train path.
        </p>
        <p>
          Evaluchat does <strong>not</strong> use your content to train our own
          proprietary models. A higher-privacy (no-train / private) model tier
          is planned and is not available yet.
        </p>
        <p>
          Provider policies change. If you need contractual no-train guarantees
          for an institution, contact {SUPPORT_EMAIL} before purchasing at
          scale.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Payments</h2>
        <p>
          The public beta does not collect payment or billing data. If that
          changes, this policy will be updated before paid access begins.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Where data lives</h2>
        <p>
          The primary application and teaching data for the live Service are
          hosted on an <strong>EEA VPS</strong> (Nuremberg). Auth and database
          services for that environment are self-hosted there.
        </p>
        <p>
          Some subprocessors sit outside the EEA, including Cloudflare (edge /
          tunnel), OpenRouter and underlying model providers, and transactional
          email. Where personal data is transferred internationally, we rely on
          the safeguards those providers offer (for example standard contractual
          clauses) and limit what we send to what the Service needs.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Cookies</h2>
        <p>
          We use cookies and similar technologies that are needed to run the
          Service. We do not use advertising or cross-site tracking cookies.
        </p>
        <ul>
          <li>
            <strong>Authentication and session</strong> — set by our auth stack
            (Supabase) so you can stay signed in and so the server can recognise
            your session securely.
          </li>
          <li>
            <strong>Security and operations</strong> — edge or host providers
            (for example Cloudflare) may set strictly necessary cookies to
            protect the site from abuse and keep the connection reliable.
          </li>
          <li>
            <strong>Preferences / product state</strong> — small client cookies
            may remember non-sensitive UI or workspace choices (for example a
            selected assistant or thread) so the product works as expected.
          </li>
          <li>
            <strong>Support widget</strong> — if live chat is enabled on a page,
            the support provider may set its own cookies to operate the widget.
            Those cookies are governed by that provider’s policy as well as this
            one.
          </li>
        </ul>
        <p>
          Process-evidence metrics used in teaching (for example keystroke
          cadence summaries) are collected while you use an assignment session;
          they are not advertising cookies and are described under “What we
          collect” above.
        </p>
        <p>
          Because these cookies are primarily strictly necessary for the
          Service, we do not show a separate cookie consent banner today. If we
          add non-essential analytics or marketing cookies later, we will update
          this section and obtain consent where required.
        </p>
      </section>

      <section className="space-y-3">
        <h2>How long we keep data</h2>
        <ul>
          <li>
            Account and assignment data — while your account is active and as
            needed to provide the Service, then for a reasonable period for
            support, dispute, and legal obligations.
          </li>
          <li>
            Credit purchase records — as needed for accounting and fraud
            prevention.
          </li>
          <li>Server logs — short rolling retention for security and ops.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Your rights</h2>
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, or export personal data, or to object to or restrict certain
          processing. Email {SUPPORT_EMAIL} and we will respond. You may also
          complain to your local data protection authority (in South Africa, the
          Information Regulator; in the EEA, your national supervisory
          authority).
        </p>
      </section>

      <section className="space-y-3">
        <h2>Children</h2>
        <p>
          Evaluchat is aimed at higher-education and adult language teaching
          contexts (for example EAP / ESL). It is not directed at children under
          13, and we do not knowingly collect personal data from children under
          13.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. The “Last updated” date
          at the top shows the current version. Material changes will be
          reflected on this page.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Contact</h2>
        <p>
          Privacy questions:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </>
  );
}
