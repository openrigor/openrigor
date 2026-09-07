"use client";

import { useUserContext } from "@/contexts/UserContext";
import { postLoginPath } from "@/lib/teaching/config";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

function OpenCanvasButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useUserContext();
  const href = user ? postLoginPath(user) : "/auth/login";

  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

export function HeroSection() {
  const t = useTranslations("landing");
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div>
          <span className="eyebrow">{t("heroEyebrow")}</span>
          <h1>
            {t("heroTitle")}
            <br />
            <em>{t("heroTitleAccent")}</em>
          </h1>
          <p className="hero-sub">{t("heroParagraphOne")}</p>
          <p className="hero-sub">{t("heroParagraphTwo")}</p>
          <div className="hero-ctas">
            <OpenCanvasButton className="btn btn-primary">
              {t("openWorkspace")}
              <ArrowRight className="arrow" width={15} height={15} />
            </OpenCanvasButton>
            <a className="btn btn-outline" href="#research">
              {t("exploreResearch")}
            </a>
          </div>
          <div className="hero-trust" aria-label="Platform foundations">
            <span>{t("markdownNative")}</span>
            <span>{t("gitVersioned")}</span>
            <span>{t("optionalAi")}</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="doc">
            <video
              className="aspect-video w-full object-cover"
              src="/login-demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Short demo of the OpenRigor workspace"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function HypothesisSection() {
  const t = useTranslations("landing");
  return (
    <section className="hypothesis section" id="about">
      <div className="container hypo-grid">
        <div>
          <h2>{t("hypothesisTitle")}</h2>
          <p className="hypo-stand">{t("hypothesisParagraphOne")}</p>
          <p className="hypo-stand">{t("hypothesisParagraphTwo")}</p>
          <p className="hypo-stand">{t("hypothesisParagraphThree")}</p>
        </div>
        <div className="guide-card">
          <p className="g-label">{t("sharedQuestion")}</p>
          <p className="g-q">{t("sharedQuestionText")}</p>
          <p className="g-sub">{t("sharedQuestionDescription")}</p>
        </div>
      </div>
    </section>
  );
}

export function MeasuresSection() {
  const t = useTranslations("landing");
  return (
    <section className="measures section" id="measures">
      <div className="container">
        <h2>{t("measuresTitle")}</h2>
        <p className="lede">{t("measuresDescription")}</p>
        <div className="meas-grid">
          <div className="meas">
            <span className="m-n">01</span>
            <b>{t("sourcesAndClaims")}</b>
            <p>{t("sourcesAndClaimsQuestion")}</p>
          </div>
          <div className="meas">
            <span className="m-n">02</span>
            <b>{t("revisions")}</b>
            <p>{t("revisionsQuestion")}</p>
          </div>
          <div className="meas">
            <span className="m-n">03</span>
            <b>{t("aiAssistance")}</b>
            <p>{t("aiAssistanceQuestion")}</p>
          </div>
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          {t("trailPartOfRecord")}
        </p>
      </div>
    </section>
  );
}

const PROBLEMS = [
  { pKey: "problemAssignment", qKey: "questionAssessment" },
  { pKey: "problemHomework", qKey: "questionHomework" },
  { pKey: "problemDebate", qKey: "questionDebate" },
  { pKey: "problemAnswers", qKey: "questionSkill" },
];

export function ProblemsSection() {
  const t = useTranslations("landing");
  return (
    <section className="problems section" id="questions">
      <div className="container">
        <h2>{t("problemsTitle")}</h2>
        <p className="lede">{t("problemsDescription")}</p>
        <div className="prob-list">
          {PROBLEMS.map((row) => (
            <div className="prob-row" key={row.pKey}>
              <span className="p">{t(row.pKey)}</span>
              <span className="a">→</span>
              <span className="q">{t(row.qKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CANVAS_CAPABILITIES = [
  {
    labelKey: "optionalAiAssistance",
    titleKey: "helpWhenYouWantIt",
    bodyKey: "optionalAiBody",
  },
  {
    labelKey: "mermaidLatex",
    titleKey: "renderAsYouWrite",
    bodyKey: "mermaidLatexBody",
  },
  {
    labelKey: "printing",
    titleKey: "takeWorkWithYou",
    bodyKey: "printingBody",
  },
];

export function BuildingSection() {
  const t = useTranslations("landing");
  return (
    <section className="canvas-platform section" id="canvas">
      <div className="container">
        <span className="eyebrow">{t("commonWorkspace")}</span>
        <h2>{t("workspaceIsRecord")}</h2>
        <p className="lede">{t("workspaceDescription")}</p>
        <div className="platform-map">
          {CANVAS_CAPABILITIES.map((layer, index) => (
            <div className="platform-step" key={layer.labelKey}>
              <div className="platform-node">
                <span className="platform-number">0{index + 1}</span>
                <p className="platform-label">{t(layer.labelKey)}</p>
                <h3>{t(layer.titleKey)}</h3>
                <p>{t(layer.bodyKey)}</p>
              </div>
              {index < CANVAS_CAPABILITIES.length - 1 && (
                <span className="platform-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="dark-ctas">
          <OpenCanvasButton className="btn btn-primary">
            {t("openWorkspace")}
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://knowledge.openrigor.org/concepts/overview.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("readWorkspaceDocumentation")}
          </a>
        </div>
      </div>
    </section>
  );
}

const RESEARCH_QUESTIONS = [
  "researchQuestionCritic",
  "researchQuestionWrong",
  "researchQuestionTakenAway",
  "researchQuestionRetain",
  "researchQuestionHistory",
] as const;

export function ResearchSection() {
  const t = useTranslations("landing");
  return (
    <section className="research section" id="research">
      <div className="container">
        <span className="eyebrow">{t("researchInOpen")}</span>
        <h2>{t("researchProgrammeTitle")}</h2>
        <p className="lede">{t("researchProgrammeDescription")}</p>
        <div className="evidence-flow" aria-label="Evidence lifecycle">
          <span>{t("question")}</span>
          <i>→</i>
          <span>{t("method")}</span>
          <i>→</i>
          <span>{t("workspaceActivity")}</span>
          <i>→</i>
          <span>{t("publicRecord")}</span>
          <i>→</i>
          <span>{t("claimChallengeReplication")}</span>
        </div>
        <div className="research-grid">
          <div>
            <p className="measure-label">{t("questionsWeCanInvestigate")}</p>
            <div className="prog-list">
              {RESEARCH_QUESTIONS.map((question, index) => (
                <div className="prog" key={question}>
                  <span className="p-n">0{index + 1}</span>
                  <div>
                    <b>{t(question)}</b>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="research-principles">
            <p className="measure-label">{t("whatMakesInspectable")}</p>
            <div>
              <b>{t("evidenceContribution")}</b>
              <p>{t("evidenceContributionDescription")}</p>
            </div>
            <div>
              <b>{t("ledger")}</b>
              <p>{t("ledgerDescription")}</p>
            </div>
            <div>
              <b>{t("humanAuthoredFinding")}</b>
              <p>{t("humanAuthoredFindingDescription")}</p>
            </div>
          </div>
        </div>
        <div className="dark-ctas">
          <a
            className="btn btn-outline"
            href="https://research.openrigor.org/methods/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("exploreResearchCatalogue")}
          </a>
        </div>
      </div>
    </section>
  );
}

const OPEN_LAYERS = [
  {
    labelKey: "workspace",
    textKey: "openWorkspaceText",
  },
  {
    labelKey: "okf",
    textKey: "okfText",
  },
  {
    labelKey: "git",
    textKey: "gitText",
  },
];

const DATA_CONTROL = [
  {
    labelKey: "privateRepo",
    textKey: "privateRepoText",
  },
  {
    labelKey: "byokRecommended",
    textKey: "byokText",
  },
  {
    labelKey: "markdownOnly",
    textKey: "markdownOnlyText",
  },
];

export function OssSection() {
  const t = useTranslations("landing");
  return (
    <section className="oss section" id="open-source">
      <div className="container">
        <span className="eyebrow on-dark">{t("openByDesign")}</span>
        <h2>{t("openDesignTitle")}</h2>
        <p className="lede">{t("openDesignDescription")}</p>
        <div className="open-layers">
          {OPEN_LAYERS.map((layer) => (
            <div className="open-layer" key={layer.labelKey}>
              <span>{t(layer.labelKey)}</span>
              <p>{t(layer.textKey)}</p>
            </div>
          ))}
        </div>
        <div className="open-layers">
          {DATA_CONTROL.map((layer) => (
            <div className="open-layer" key={layer.labelKey}>
              <span>{t(layer.labelKey)}</span>
              <p>{t(layer.textKey)}</p>
            </div>
          ))}
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          {t("readThe")}{" "}
          <a className="link" href="/privacy/shared-model">
            {t("privacyNotice")}
          </a>{" "}
          {t("privacyNoticeDescription")}
        </p>
        <div className="dark-ctas">
          <a
            className="btn btn-primary"
            href="https://github.com/openrigor/openrigor"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("viewOnGithub")}
          </a>
          <OpenCanvasButton className="btn btn-ghost">
            {t("openWorkspace")}
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection() {
  const t = useTranslations("landing");
  return (
    <section className="final-cta">
      <div className="container">
        <span className="eyebrow">{t("invitation")}</span>
        <h2>{t("invitationTitle")}</h2>
        <p>{t("invitationDescription")}</p>
        <div className="final-ctas">
          <OpenCanvasButton className="btn btn-primary">
            {t("openWorkspace")}
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://research.openrigor.org/methods/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("exploreResearchCatalogue")}
          </a>
        </div>
      </div>
    </section>
  );
}
