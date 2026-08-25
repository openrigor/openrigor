import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/components/auth/login/login-branding";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import { PrivacyPolicyContent } from "@/components/legal/privacy-policy-content";

export const metadata: Metadata = {
  title: "Privacy Policy · OpenRigor",
  description:
    "How OpenRigor collects and uses personal data in the public beta.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentLayout
      title="Privacy Policy"
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <PrivacyPolicyContent />
    </LegalDocumentLayout>
  );
}
