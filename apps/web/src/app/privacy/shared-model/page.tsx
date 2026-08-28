import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import {
  SHARED_MODEL_NOTICE_EFFECTIVE_DATE,
  SharedModelNoticeContent,
} from "@/lib/privacy/shared-model-notice";

export const metadata: Metadata = {
  title: "Shared-model privacy notice · OpenRigor",
  description:
    "The versioned privacy notice for OpenRigor shared-model processing.",
};

export default function SharedModelPrivacyNoticePage() {
  return (
    <LegalDocumentLayout
      title="Shared-model privacy notice"
      lastUpdated={SHARED_MODEL_NOTICE_EFFECTIVE_DATE}
    >
      <SharedModelNoticeContent />
    </LegalDocumentLayout>
  );
}
