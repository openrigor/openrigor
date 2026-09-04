import Link from "next/link";
import {
  LEGAL_OPERATOR_NAME,
  SUPPORT_EMAIL,
  TERMS_PATH,
} from "@/components/auth/login/login-branding";
import { getTranslations } from "next-intl/server";

export async function PrivacyPolicyContent() {
  const t = await getTranslations("legal");
  return (
    <>
      <section className="space-y-3">
        <p>{t("privacyIntro")}</p>
        <p>{t("privacyPlainLanguage")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("whoWeAre")}</h2>
        <p>
          {t("operatorIntro")} <strong>{LEGAL_OPERATOR_NAME}</strong>.{" "}
          {t("privacyRequestsEmail")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <p>{t("euRepresentative")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("roles")}</h2>
        <ul>
          <li>
            <strong>{t("openRigor")}</strong> {t("controllerRole")}
          </li>
          <li>
            {t("teacherControllerRole")}{" "}
            <Link href={TERMS_PATH}>{t("termsOfService")}</Link>.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>{t("whatWeCollect")}</h2>
        <ul>
          <li>
            <strong>{t("accountIdentity")}</strong> —{" "}
            {t("accountIdentityDescription")}
          </li>
          <li>
            <strong>{t("assignmentContent")}</strong> —{" "}
            {t("assignmentContentDescription")}
          </li>
          <li>
            <strong>{t("processEvidenceMetrics")}</strong> —{" "}
            {t("processEvidenceDescription")}
          </li>
          <li>
            <strong>{t("supportAndLeads")}</strong> —{" "}
            {t("supportAndLeadsDescription")} {SUPPORT_EMAIL}{" "}
            {t("earlyAccessForms")}
          </li>
          <li>
            <strong>{t("technicalLogs")}</strong> —{" "}
            {t("technicalLogsDescription")}
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>{t("aiProvidersAndTraining")}</h2>
        <p>
          {t("aiProviderProcessing")} {t("trafficRoutedThrough")}{" "}
          <strong>OpenRouter</strong>. {t("defaultBudgetModels")}{" "}
          <strong>DeepSeek-class</strong> {t("andSimilarModels")}
        </p>
        <p>
          <strong>{t("providerTrainingWarning")}</strong>{" "}
          {t("providerTrainingTerms")}
        </p>
        <p>{t("ownModelTraining")}</p>
        <p>
          {t("providerPoliciesChange")} {SUPPORT_EMAIL} {t("beforePurchasing")}
        </p>
      </section>

      <section className="space-y-3">
        <h2>{t("payments")}</h2>
        <p>{t("paymentsDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("whereDataLives")}</h2>
        <p>
          {t("primaryDataLocation")} <strong>EEA VPS</strong>{" "}
          {t("primaryDataLocationSuffix")}
        </p>
        <p>{t("internationalTransfers")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("cookies")}</h2>
        <p>{t("cookiesDescription")}</p>
        <ul>
          <li>
            <strong>{t("authenticationAndSession")}</strong> —{" "}
            {t("authenticationDescription")}
          </li>
          <li>
            <strong>{t("securityAndOperations")}</strong> —{" "}
            {t("securityDescription")}
          </li>
          <li>
            <strong>{t("preferencesAndProductState")}</strong> —{" "}
            {t("preferencesDescription")}
          </li>
          <li>
            <strong>{t("supportWidget")}</strong> —{" "}
            {t("supportWidgetDescription")}
          </li>
        </ul>
        <p>{t("metricsCookiesClarification")}</p>
        <p>{t("cookieConsentDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("retention")}</h2>
        <ul>
          <li>{t("accountRetention")}</li>
          <li>{t("creditRetention")}</li>
          <li>{t("serverLogRetention")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>{t("yourRights")}</h2>
        <p>
          {t("rightsDescription")} {SUPPORT_EMAIL}{" "}
          {t("rightsDescriptionSuffix")}
        </p>
      </section>

      <section className="space-y-3">
        <h2>{t("children")}</h2>
        <p>{t("childrenDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("changes")}</h2>
        <p>{t("privacyChangesDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("contact")}</h2>
        <p>
          {t("privacyQuestions")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </>
  );
}
