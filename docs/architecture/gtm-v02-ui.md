# GTM-RedTeam v0.2 Beta workspace

This is a local UI/interaction redesign on top of the existing audit engine. The release version is `0.2.0-beta.1`. This is a local single-user Beta; live commercial quality and production hosting are not certified.

## Workspace and routes

- `?screen=home`: Project Hub with record-derived summaries, project search/status filters, project table, and an explicitly labeled Synthetic Demo evidence-chain preview. An empty repository stays empty; the example never becomes a project or a statistic.
- `?screen=projects`: full project list.
- `?screen=create[&audit=ID]`: four-step setup (basics → materials → whole-source selection/budget → explicit confirmation/run). The draft persists after creation. Saved commercial context is immutable through the current API; project editing and archiving remain Planned.
- `?screen=audit&audit=ID`: project header, actual run actions, five-stage timeline, risk explorer, and a separately scrolling detail pane. Filters cover risk type, model-assessed severity, server Claim classification, human review state, and text search. Selecting a risk updates its Claim/evidence/rebuttal/review context. Switching risks or tabs resets detail scroll to the top.
- `?screen=report&audit=ID`: structured report with nine chapter links, evidence/Claim details, rebuttals, unknowns, experiments, source coverage/registry, current independent human reviews, and methods/limitations. Markdown downloads use the original report endpoint, retaining the evidence chain.
- `?screen=sources`: project-scoped source registry entry points (draft management or frozen snapshots).
- `?screen=reports`: generated report list.
- `?screen=settings`: read-only runtime configuration; no credentials are read/displayed by the UI.
- `?screen=evaluations`: explicit Planned state; no fake evaluation actions.

Browser back/forward and direct URLs are supported. Old `?screen=home&audit=ID` links open audit preparation. GET/reload never starts a run. Started inputs are read-only. Terminal/paused audits have no unsupported restart/resume button.

## Frontend structure

- `GtmApp.tsx`: workspace shell, routes, API loading/polling, project hub/registry pages.
- `GtmCreate.tsx`: four-step creation and source/budget workflow.
- `GtmWorkspace.tsx`: five-stage progress, filters, selected risk, independent review actions.
- `GtmEvidence.tsx`: shared Claim/evidence viewer, overview, and Blue rebuttal components.
- `GtmReport.tsx`: structured document rendering from the persisted deterministic report plus current independent reviews.
- `gtm-ui.tsx`: typed API responses, labels, inline geometric icons, and shared components.
- `gtm.css`: shared design tokens, desktop split panels, tablet layouts, and mobile navigation/readability. No added UI framework, fonts, remote assets, or runtime dependency.

## Minimal API addition

`GET /api/gtm/audits` now also returns `createdAt`, `targetMarket`, `provider`, `sourceCount`, `riskCount`, and `pendingReviewCount`. These fields are computed from each persisted record. No raw material content is included in the list response. Existing response fields, schemas, write endpoints, budget policies, citation validation, engine, and report generation are unchanged.

## Evidence and state semantics

- Exactly five business phases. `rebuttal_verifying` is a Blue Rebuttal internal state. Stage details use recorded call timestamps; unavailable independent timestamps remain “未提供”.
- Claim classifications and citation verdicts are read-only server results. Citation source IDs, paragraph IDs, full material revisions, original quotes, source paragraphs, and supplied metadata remain discoverable.
- Risk severity is labeled Model assessed. Citation integrity does not establish business truth. Missing/insufficient evidence stays visible.
- Human review calls the existing independent review endpoint. The UI displays the current saved decision, note, and timestamp. It never updates machine classifications or overwrites machine report records.
- Actual usage uses the ledger: absent usage is “不可用”, partial usage is explicitly marked. Estimates appear only as estimates in input budget views and call records.
- PDF import/export, project editing/archiving, evaluation management, cross-project shared sources, and resume actions are not implemented. Unsupported actions are hidden or labeled Planned.

## Validation

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e:gtm -- <output-directory>
npm run test:e2e:gtm:v02 -- <output-directory>
git diff --check
```

Both browser scripts create an isolated temporary repository under `work/`, bind an ephemeral loopback port, and close the server/browser on completion. They never read `.env.gtm.local`, invoke the real HTTP model provider, or write production records. The second script uses explicitly synthetic multi-risk provider fixtures through the unchanged engine to exercise selected-risk interactions and evidence classifications; those fixture verdicts are UI test inputs, not model-quality evidence.
