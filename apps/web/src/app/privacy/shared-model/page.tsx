import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import {
  SHARED_MODEL_NOTICE_EFFECTIVE_DATE,
  SharedModelNoticeContent,
} from "@/lib/privacy/shared-model-notice";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return {
    title: t("sharedModelTitleWithBrand"),
    description: t("sharedModelDescription"),
  };
}

export default async function SharedModelPrivacyNoticePage() {
  const t = await getTranslations("legal");
  return (
    <LegalDocumentLayout
      title={t("sharedModelPrivacyNotice")}
      lastUpdated={SHARED_MODEL_NOTICE_EFFECTIVE_DATE}
    >
      <SharedModelNoticeContent />
    </LegalDocumentLayout>
  );
}
