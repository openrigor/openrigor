"use client";

import { useUserContext } from "@/contexts/UserContext";
import { postLoginPath } from "@/lib/teaching/config";
import { ArrowRight } from "lucide-react";

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
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div>
          <span className="eyebrow">Markdown-native research tool</span>
          <h1>
            Research in plain markdown.
            <br />
            <em>AI when you want it.</em>
          </h1>
          <p className="hero-sub">
            OpenRigor is a markdown-native workspace where your documents,
            methods, and evidence live together. The work stays plain text,
            versioned in a private repository you control, with nothing locked
            in a proprietary format.
          </p>
          <p className="hero-sub">
            Built-in AI can draft, revise, organise, and collate sources when
            you want help. It is optional and visible, and you can do the
            research with no AI at all.
          </p>
          <div className="hero-ctas">
            <OpenCanvasButton className="btn btn-primary">
              Open Workspace
              <ArrowRight className="arrow" width={15} height={15} />
            </OpenCanvasButton>
            <a className="btn btn-outline" href="#research">
              Explore the research
            </a>
          </div>
          <div className="hero-trust" aria-label="Platform foundations">
            <span>Markdown-native</span>
            <span>Git-versioned</span>
            <span>Optional AI</span>
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
  return (
    <section className="hypothesis section" id="about">
      <div className="container hypo-grid">
        <div>
          <h2>The result matters. The path to it does too.</h2>
          <p className="hypo-stand">
            A finished document never shows the research behind it: the drafts,
            dead ends, sources, and decisions.
          </p>
          <p className="hypo-stand">
            The work is verifiable only when the process is kept, not just the
            result.
          </p>
          <p className="hypo-stand">
            AI can help with the process. A versioned trail keeps the work
            visible, so there is no need to ban or distrust AI.
          </p>
        </div>
        <div className="guide-card">
          <p className="g-label">The shared question</p>
          <p className="g-q">How do you show the research behind the result?</p>
          <p className="g-sub">
            OpenRigor keeps drafts, sources, decisions, and revisions in one
            open, versioned trail you can inspect.
          </p>
        </div>
      </div>
    </section>
  );
}

export function MeasuresSection() {
  return (
    <section className="measures section" id="measures">
      <div className="container">
        <h2>Three parts of the research record.</h2>
        <p className="lede">
          The workspace keeps the research trail visible from question to
          finding.
        </p>
        <div className="meas-grid">
          <div className="meas">
            <span className="m-n">01</span>
            <b>Sources and claims</b>
            <p>Where did this claim come from?</p>
          </div>
          <div className="meas">
            <span className="m-n">02</span>
            <b>Revisions</b>
            <p>What changed along the way, and what was the reasoning?</p>
          </div>
          <div className="meas">
            <span className="m-n">03</span>
            <b>AI assistance</b>
            <p>What did AI propose, and what did you decide?</p>
          </div>
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          The trail is part of the research record.
        </p>
      </div>
    </section>
  );
}

const PROBLEMS = [
  {
    p: "AI can write the assignment.",
    q: "What exactly are we assessing?",
  },
  {
    p: "AI can solve the homework.",
    q: "What is the homework for?",
  },
  {
    p: "AI can argue both sides.",
    q: "What should a debate actually measure?",
  },
  {
    p: "AI can produce ten plausible answers.",
    q: "Is producing another answer really the skill?",
  },
];

export function ProblemsSection() {
  return (
    <section className="problems section" id="questions">
      <div className="container">
        <h2>Questions worth testing, not declaring.</h2>
        <p className="lede">
          The first questions come from education research. They also matter in
          systematic reviews, verification, and fact-checking AI-assisted work.
        </p>
        <div className="prob-list">
          {PROBLEMS.map((row) => (
            <div className="prob-row" key={row.p}>
              <span className="p">{row.p}</span>
              <span className="a">→</span>
              <span className="q">{row.q}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CANVAS_CAPABILITIES = [
  {
    label: "Optional AI assistance",
    title: "Help when you want it",
    body: "Ask the assistant to suggest, revise or explain content when useful; the Workspace remains fully usable with AI turned off.",
  },
  {
    label: "Mermaid + LaTeX",
    title: "Render the work as you write",
    body: "Render Mermaid diagrams and LaTeX directly in the Workspace alongside the document.",
  },
  {
    label: "Printing",
    title: "Take the work with you",
    body: "Print the document or create clean PDF output for sharing and review.",
  },
];

export function BuildingSection() {
  return (
    <section className="canvas-platform section" id="canvas">
      <div className="container">
        <span className="eyebrow">The common workspace</span>
        <h2>The workspace is the research record.</h2>
        <p className="lede">
          Write documents, methods, notes, and evidence as plain markdown in one
          workspace. Render Mermaid diagrams and LaTeX, print clean PDFs, and
          use optional AI assistance to draft, revise, organise, or explain. The
          work stays in a private repository you control.
        </p>
        <div className="platform-map">
          {CANVAS_CAPABILITIES.map((layer, index) => (
            <div className="platform-step" key={layer.label}>
              <div className="platform-node">
                <span className="platform-number">0{index + 1}</span>
                <p className="platform-label">{layer.label}</p>
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
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
            Open Workspace
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://knowledge.openrigor.org/concepts/overview.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read Workspace documentation
          </a>
        </div>
      </div>
    </section>
  );
}

const RESEARCH_QUESTIONS = [
  "Does using AI as a critic produce different thinking from using it as a generator?",
  "Can students recognise when AI is wrong?",
  "What remains when the AI is taken away?",
  "Does AI change what people retain and transfer?",
  "Can revision history provide trustworthy evidence of student process—and for which learners, tasks and AI-use patterns does it mislead?",
];

export function ResearchSection() {
  return (
    <section className="research section" id="research">
      <div className="container">
        <span className="eyebrow">Research in the open</span>
        <h2>A research programme that can evolve.</h2>
        <p className="lede">
          OpenRigor starts with no answer in mind. The catalogue grows as
          researchers try methods that use AI, limit it, or test claims about
          its use. The first wave asks whether each method serves the question
          it was built to answer.
        </p>
        <div className="evidence-flow" aria-label="Evidence lifecycle">
          <span>Question</span>
          <i>→</i>
          <span>Method</span>
          <i>→</i>
          <span>Workspace activity</span>
          <i>→</i>
          <span>Public record</span>
          <i>→</i>
          <span>Claim, challenge or replication</span>
        </div>
        <div className="research-grid">
          <div>
            <p className="measure-label">Questions we can investigate</p>
            <div className="prog-list">
              {RESEARCH_QUESTIONS.map((question, index) => (
                <div className="prog" key={question}>
                  <span className="p-n">0{index + 1}</span>
                  <div>
                    <b>{question}</b>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="research-principles">
            <p className="measure-label">What makes it inspectable</p>
            <div>
              <b>Evidence contribution</b>
              <p>The work carries its method and source history with it.</p>
            </div>
            <div>
              <b>Ledger</b>
              <p>The Ledger records the work. It is not a finding.</p>
            </div>
            <div>
              <b>Human-authored finding</b>
              <p>People write the finding. AI does not.</p>
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
            Explore the research catalogue
          </a>
        </div>
      </div>
    </section>
  );
}

const OPEN_LAYERS = [
  {
    label: "Workspace",
    text: "An MIT-licensed Markdown workspace: useful on its own and open to inspection, extension and self-hosting.",
  },
  {
    label: "OKF",
    text: "Portable Markdown and YAML knowledge that people and AI can use from the same, inspectable source material.",
  },
  {
    label: "Git",
    text: "History, attribution, review and distribution for methods, knowledge and public research contributions.",
  },
];

const DATA_CONTROL = [
  {
    label: "Private repo",
    text: "Your private GitHub repository holds the work and the OpenRigor records that go with it, including Ledgers.",
  },
  {
    label: "BYOK (recommended)",
    text: "Use your own AI provider. Its retention policy applies.",
  },
  {
    label: "Markdown-only",
    text: "No OpenRigor language model is used. The shared service stays off unless you turn it on.",
  },
];

export function OssSection() {
  return (
    <section className="oss section" id="open-source">
      <div className="container">
        <span className="eyebrow on-dark">Open by design</span>
        <h2>Research becomes more useful when it can travel.</h2>
        <p className="lede">
          OpenRigor is a markdown-native research tool with built-in AI process
          assistance. The catalogue begins with one research programme; the
          workspace can support research elsewhere too. Your private repository
          stays yours, and you decide whether AI is part of the work.
        </p>
        <div className="open-layers">
          {OPEN_LAYERS.map((layer) => (
            <div className="open-layer" key={layer.label}>
              <span>{layer.label}</span>
              <p>{layer.text}</p>
            </div>
          ))}
        </div>
        <div className="open-layers">
          {DATA_CONTROL.map((layer) => (
            <div className="open-layer" key={layer.label}>
              <span>{layer.label}</span>
              <p>{layer.text}</p>
            </div>
          ))}
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          Read the{" "}
          <a className="link" href="/privacy/shared-model">
            privacy notice
          </a>{" "}
          to learn how the shared service handles data. When you work without
          AI, no OpenRigor language model runs.
        </p>
        <div className="dark-ctas">
          <a
            className="btn btn-primary"
            href="https://github.com/openrigor/openrigor"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          <OpenCanvasButton className="btn btn-ghost">
            Open Workspace
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection() {
  return (
    <section className="final-cta">
      <div className="container">
        <span className="eyebrow">The invitation</span>
        <h2>Bring a question. Try a method. Show your work.</h2>
        <p>
          The Workspace gives the research a place to happen. Open methods and
          shareable knowledge help others follow and build on the result.
        </p>
        <div className="final-ctas">
          <OpenCanvasButton className="btn btn-primary">
            Open Workspace
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://research.openrigor.org/methods/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the research catalogue
          </a>
        </div>
      </div>
    </section>
  );
}
