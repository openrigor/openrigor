import Link from "next/link";
import {
  LEGAL_OPERATOR_NAME,
  PRIVACY_PATH,
  SUPPORT_EMAIL,
} from "@/components/auth/login/login-branding";
import { getTranslations } from "next-intl/server";

export async function TermsOfServiceContent() {
  const t = await getTranslations("legal");
  return (
    <>
      <section className="space-y-3">
        <p>{t("termsIntro")}</p>
        <p>
          {t("operatorIntro")} <strong>{LEGAL_OPERATOR_NAME}</strong>.{" "}
          {t("contactLabel")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2>{t("theService")}</h2>
        <p>{t("serviceDescription")}</p>
        <p>{t("betaNoBilling")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("accountsAndUse")}</h2>
        <ul>
          <li>{t("accurateAccountInformation")}</li>
          <li>{t("accountResponsibility")}</li>
          <li>{t("acceptableUse")}</li>
          <li>{t("teacherResponsibility")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>{t("betaAccess")}</h2>
        <p>{t("betaAccessDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("aiAndThirdPartyModels")}</h2>
        <p>{t("aiDisclaimer")}</p>
        <p>
          {t("providerProcessingPrefix")}{" "}
          <strong>{t("providerTrainingWarning")}</strong>{" "}
          {t("providerTermsPrefix")}{" "}
          <Link href={PRIVACY_PATH}>{t("privacyPolicy")}</Link>{" "}
          {t("researchProfilesDescription")}
        </p>
      </section>

      <section className="space-y-3">
        <h2>{t("intellectualProperty")}</h2>
        <p>{t("contentOwnership")}</p>
        <p>{t("productOwnership")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("disclaimersAndLiability")}</h2>
        <p>{t("serviceDisclaimer")}</p>
        <p>{t("liabilityLimit")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("governingLaw")}</h2>
        <p>{t("governingLawDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("changes")}</h2>
        <p>{t("termsChangesDescription")}</p>
      </section>

      <section className="space-y-3">
        <h2>{t("contact")}</h2>
        <p>
          {t("questions")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </>
  );
}
