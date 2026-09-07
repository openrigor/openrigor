import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/components/auth/login/login-branding";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import { TermsOfServiceContent } from "@/components/legal/terms-of-service-content";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return {
    title: t("termsTitleWithBrand"),
    description: t("termsDescription"),
  };
}

export default async function TermsPage() {
  const t = await getTranslations("legal");
  return (
    <LegalDocumentLayout
      title={t("termsOfService")}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <TermsOfServiceContent />
    </LegalDocumentLayout>
  );
}
