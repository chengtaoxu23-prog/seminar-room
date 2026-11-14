# Case 001 — Temu US historical evidence replay

T0: **2023-06-30**. T1: **2024-09-13**. Source text and publication dates checked on 2026-11-14 against the primary government pages linked in `registry.json`. Dates shown by search engines are not used as publication dates.

This is a small, reproducible **offline workflow replay**, not a validated commercial case study. Source excerpts are real; semantic assessments, directions, audit output and proposed transitions are **MOCK / SYNTHETIC**. No model call or keyword-based semantic inference is performed. Missing CAC, LTV, margins, conversion or operating outcomes remain unknown.

## Source registry and time boundaries

1. **2023-06-22 — US House Select Committee press release**, “Select Committee Releases Interim Findings from Shein & Temu Forced Labor Investigation.” Locators: **Key Finding 2**, dependence on de minimis; **Key Finding 3**, the committee's statements about compliance systems. These are attributed preliminary investigative statements, not independent proof of Temu costs, forced labor incidence or profitability. Only the two short exact excerpts in `registry.json` are included. Both are before T0. This page does not supply Temu unit economics.
2. **2024-09-13 — archived White House fact sheet**, “Biden-Harris Administration Announces New Actions … De Minimis Shipments …”. Locator: **Administration Action Intended to Reduce De Minimis Import Volumes → New Rulemaking to Reduce De Minimis Volume and Strengthen Trade Enforcement**, first sentence. It announces intended rulemaking. It is available at T1 and excluded from T0. It does **not** establish that the contemplated restriction was already enacted at T1 or quantify its impact on Temu.

The archive host reflects later preservation of the White House page; the document's printed date is 2024-09-13. These excerpts do not incorporate later policy outcomes. The replay relies on the identified historical publications; it does not claim independent authentication of every historical page revision. No complete third-party report is redistributed.

## Local operation

From the repository root:

```sh
npm run build
npm run start:v03:offline
```

Open `http://127.0.0.1:4318/?screen=hypotheses`. This entry point uses an explicit Mock provider and isolated `work/v03-local/audits` storage. It does not load `.env` files. Stop the running terminal process to stop this preview. Do not overwrite existing deployments or terminate unrelated listeners.

1. Click **Case 001 · 导入并锁定 T0 Contracts**. This explicit human action creates and locks three contract drafts, H-001/H-002/H-003, with only the T0 excerpt. Metric thresholds remain unset; review the qualitative demonstration criteria before reuse.
2. Select a hypothesis. In **Evidence Delta**, select its T0 source. Choose P1 or P2 and copy an exact excerpt from that paragraph. Select **inconclusive** for the offline fixture, then generate Delta. Citation checking is real; the fixture direction is explicitly not a research conclusion.
3. In **Human Review**, enter a reason and approve, reject or request further research. Only approval changes the formal status. Rejection and further research remain in the event history without silently changing it.
4. Add the **T1 policy proposal excerpt**. Select only this new source and generate another Delta. Earlier Delta IDs are retained as the comparison baseline. An identical source revision or repeated assessment is rejected. The default fixture remains inconclusive.
5. Select complete sources and run **Hypothesis Mock 审计**. The existing five-stage engine creates an audit linked to the locked contract revision. Existing Audits and Reports show the immutable result. Its proposal requires separate human approval.
6. Inspect **Decision Timeline**, expand evidence provenance, and export the complete JSON ledger. Contract edits after lock create a new draft revision; previous locked versions remain visible. Old-revision proposals cannot approve a new contract. Current status records its own contract revision.

## Reproduce the automated demonstration

```sh
npm run test:e2e:v03 -- ./work/v03-replay-evidence
```

The script creates isolated persistent records and actually operates the browser. It exports screenshots, a complete demo ledger, T0 contracts and a T1 Delta, with synthetic and Temu records separately named. It also exercises a separate explicitly synthetic CSV/multi-round scenario, invalid citations, rejection, approval, locked contract versioning, an engine audit and reload recovery. The full ledger intentionally retains all demonstration events so its hash chain can be checked without removing earlier events.

## Scope

The two primary-source excerpts are sufficient to demonstrate historical source gating, evidence provenance and explicit uncertainty. They are insufficient to establish actual Temu cost dependencies, the commercial impact of supply-chain compliance, or US unit economics. The three candidate hypotheses remain research questions. Human state changes in this replay are demonstrations, not validated Temu findings.
