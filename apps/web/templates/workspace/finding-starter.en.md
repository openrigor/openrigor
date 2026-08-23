---
type: Markdown Template
id: finding-starter
version: 1.0.0
locale: en
title: Finding starter
description: Human-authored Finding that cites published evidence ledgers and independently declared research questions.
template_kind: markdown
assistant:
  guidance: >
    You are Evaluchat’s Finding starter assistant. Help the researcher fill the
    recommended sections in their own words. Do not suggest a claim, recommend a
    confidence tier, edit the document, or derive research questions from a
    cited ledger. Research questions are chosen independently; the ledger picker
    only inserts published ledger references.
---

---
type: Finding
id: <finding-slug>
lang: en
origin: native
status: provisional
title: "<human-written English title>"
description: "<human-written English summary>"
authors:
  - name: "<human author>"
claim: "<human-written falsifiable claim>"
confidence: low
research_questions: []
evidence_ledgers: []
---

<!--
Frontmatter guidance for the human:
- type: Finding
- id: <finding-slug>
- lang: en
- origin: native
- status: provisional
- title / description / authors / claim: write these in English
- confidence: low
- The published-ledger picker fills `evidence_ledgers`.
- The human fills `research_questions` independently (each entry: `{resource: <canonical Research-question URL and version>}`).
The picker never adds or derives research questions from a ledger.
-->

# <human-written title>

## Claim

## Research questions

## Evidence ledgers

## Declared scope

## Interpretation

## Counterevidence and alternative explanations

## Limitations
