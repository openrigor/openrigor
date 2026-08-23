import Link from "next/link";
import {
  LEGAL_OPERATOR_NAME,
  PRIVACY_PATH,
  SUPPORT_EMAIL,
} from "@/components/auth/login/login-branding";

export function TermsOfServiceContent() {
  return (
    <>
      <section className="space-y-3">
        <p>
          These Terms of Service (“Terms”) govern access to and use of evaluchat
          (the “Service”). By creating an account or using the Service, you
          agree to these Terms.
        </p>
        <p>
          Evaluchat is the trading name of{" "}
          <strong>{LEGAL_OPERATOR_NAME}</strong>. Contact:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2>The Service</h2>
        <p>
          Evaluchat is an AI-assisted writing coaching platform for teaching. It
          provides a chat coach and a writing canvas so students can draft with
          guided dialogue, and so teachers can review process evidence alongside
          the finished work.
        </p>
        <p>
          The public beta is provided for education and research testing. There
          is no billing, credit balance, or paid tier in this release.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Accounts and acceptable use</h2>
        <ul>
          <li>
            You must provide accurate account information and keep it current.
          </li>
          <li>
            You are responsible for activity under your account and for keeping
            credentials secure.
          </li>
          <li>
            You may not misuse the Service: no unlawful content, no attempts to
            disrupt or reverse-engineer the platform beyond what open-source
            licences already allow, and no use that harms students or other
            users.
          </li>
          <li>
            Teachers remain responsible for classroom policy, age-appropriate
            use, and institutional requirements that apply to them.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Beta access</h2>
        <p>
          Beta access may be limited, changed, or withdrawn while the platform
          is evaluated. Any future commercial terms will be published before
          paid access is introduced.
        </p>
      </section>

      <section className="space-y-3">
        <h2>AI assistance and third-party models</h2>
        <p>
          The coach can be wrong, incomplete, or uneven. Evaluchat is a teaching
          aid, not a guarantee of grades, admissions outcomes, or
          plagiarism-free status. You remain responsible for reviewing content
          before relying on it.
        </p>
        <p>
          Prompts and assignment content are processed by third-party AI
          providers (via OpenRouter; budget default includes DeepSeek-class
          models).{" "}
          <strong>
            Those providers may use inputs and outputs to improve or train their
            models
          </strong>{" "}
          under their terms. See the{" "}
          <Link href={PRIVACY_PATH}>Privacy Policy</Link> for details. A
          Research apparatus profiles may disable AI assistance entirely or
          select a different reviewed treatment.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Intellectual property</h2>
        <p>
          You retain ownership of content you submit (essays, messages, class
          materials). You grant evaluchat a limited licence to host, process,
          display, and transmit that content solely to operate and improve the
          Service as described in these Terms and the Privacy Policy.
        </p>
        <p>
          The evaluchat product, branding, and software (aside from open-source
          components under their own licences, including lineage from LangChain
          evaluchat) remain ours or our licensors’.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Disclaimers and liability</h2>
        <p>
          The Service is provided “as is” and “as available” to the fullest
          extent permitted by law. We do not warrant uninterrupted or error-free
          operation.
        </p>
        <p>
          To the fullest extent permitted by law, Evaluchat’s total liability
          arising out of or relating to the Service is limited to US$50. We are
          not liable for indirect, incidental, or consequential damages. Some
          jurisdictions do not allow certain limitations; in those cases, the
          limitation applies only to the extent allowed.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Governing law</h2>
        <p>
          These Terms (as between you and evaluchat regarding the Service) are
          governed by the laws of South Africa, without regard to
          conflict-of-law rules. The public beta has no paid access or billing
          disputes.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Changes</h2>
        <p>
          We may update these Terms. The “Last updated” date shows the current
          version. Continued use after changes means you accept the updated
          Terms, except where applicable law requires a different process.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Contact</h2>
        <p>
          Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </>
  );
}
