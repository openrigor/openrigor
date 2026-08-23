import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/components/auth/login/login-branding";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import { TermsOfServiceContent } from "@/components/legal/terms-of-service-content";

export const metadata: Metadata = {
  title: "Terms of Service · evaluchat",
  description:
    "Terms for using the Evaluchat public education and research beta.",
};

export default function TermsPage() {
  return (
    <LegalDocumentLayout
      title="Terms of Service"
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <TermsOfServiceContent />
    </LegalDocumentLayout>
  );
}
