import type { ReactNode } from "react";

import {
  SHARED_MODEL_NOTICE_EFFECTIVE_DATE,
  SHARED_MODEL_NOTICE_VERSION,
} from "@opencanvas/shared/ai-mode";

export {
  assertCurrentSharedModelNoticeVersion,
  isSharedModelNoticeVersionCurrent,
  SHARED_MODEL_NOTICE_EFFECTIVE_DATE,
  SHARED_MODEL_NOTICE_VERSION,
} from "@opencanvas/shared/ai-mode";

/**
 * The public shared-model notice is deliberately versioned independently from
 * the general Privacy Policy. Acceptance in a later task must record this
 * exact value, not a mutable display date or a provider's current terms.
 */
export const SHARED_MODEL_NOTICE_PATH = "/privacy/shared-model" as const;

export const SHARED_MODEL_NOTICE = Object.freeze({
  version: SHARED_MODEL_NOTICE_VERSION,
  effectiveDate: SHARED_MODEL_NOTICE_EFFECTIVE_DATE,
});

function NoticeFact({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <li>
      <strong>{title}</strong> — {children}
    </li>
  );
}

export function SharedModelNoticeContent() {
  return (
    <>
      <section className="space-y-3">
        <p>
          This is the versioned privacy notice for OpenRigor&apos;s optional
          shared-model service. OpenRigor is a place where methods become
          evidence: AI is a collaborator in that work, never a full-work
          generator or a replacement for human judgement. Transparency is a
          feature of that collaboration, not a limitation to hide.
        </p>
        <p>
          <strong>Version:</strong> {SHARED_MODEL_NOTICE.version}
          <br />
          <strong>Effective date:</strong> {SHARED_MODEL_NOTICE.effectiveDate}
        </p>
        <p>
          This notice is published before shared-model consent is enabled.
          Publishing it does not enable an inference path or create consent.
        </p>
      </section>

      <section className="space-y-3">
        <h2>What to understand before using a shared model</h2>
        <ul>
          <NoticeFact title="Best-effort availability">
            Shared-model availability is best effort during the beta. Capacity,
            provider responses, network conditions, and safety controls may
            affect whether a request completes.
          </NoticeFact>
          <NoticeFact title="Possible stoppage">
            OpenRigor or a provider may pause, limit, or stop this service at
            any time. Shared-model access is not an uptime or continuity
            guarantee, and work should remain understandable without it.
          </NoticeFact>
          <NoticeFact title="Logging and retention">
            Prompts, dialogue, document excerpts, outputs, and related technical
            metadata sent to a shared-model provider may be logged and retained
            under that provider&apos;s systems and terms. OpenRigor cannot
            promise zero logging or zero retention for this route.
          </NoticeFact>
          <NoticeFact title="Provider training">
            The provider may use submitted content and outputs to train or
            improve its models, subject to the provider&apos;s terms and
            changing policies. This notice does not promise a no-training path.
          </NoticeFact>
          <NoticeFact title="Hosting or processing in China">
            Shared-model content may be hosted or processed in China, including
            by a provider or its subprocessors. OpenRigor cannot guarantee that
            shared-model processing stays outside China.
          </NoticeFact>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Use the mode that fits your data</h2>
        <p>
          If these conditions are not appropriate for your work, do not put that
          content into a shared-model request. A BYOK or Markdown-only workflow
          may be a better fit when you need control over the provider or do not
          want OpenRigor to send content to a shared model. Whatever mode is
          used, AI output remains a draft or suggestion: people decide what
          counts as evidence and what they publish.
        </p>
      </section>
    </>
  );
}
