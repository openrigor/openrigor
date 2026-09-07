import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/components/auth/login/login-branding";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import { PrivacyPolicyContent } from "@/components/legal/privacy-policy-content";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return {
    title: t("privacyPolicyTitleWithBrand"),
    description: t("privacyPolicyDescription"),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal");
  return (
    <LegalDocumentLayout
      title={t("privacyPolicy")}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <PrivacyPolicyContent />
    </LegalDocumentLayout>
  );
}
