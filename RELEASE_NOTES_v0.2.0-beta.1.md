# GTM-RedTeam v0.2.0-beta.1

Local single-user Beta for evidence-backed GTM risk auditing.

- Project Hub with record-derived summaries, search, status filters and source/report entry points.
- Four-step audit setup with whole-source selection, budget checks and explicit run confirmation.
- Audit Workspace with five stages, selectable risks, Claim analysis, original evidence, Blue rebuttals and independent Human Review.
- Structured nine-section Report Center and Markdown export.
- Desktop, tablet and mobile layouts; no added runtime dependency.

Validation: 153 automated tests, typecheck/build, two Mock browser suites, and one new DeepSeek synthetic live audit (5 calls; 22,873 actual tokens), followed by UI review/export/reload acceptance. The original engine, state machine, citation rules and budget ledger remain unchanged.

Limitations: local single-user only; no PDF import/export, shared cloud hosting, project editing/archiving or managed evaluations. Model-assessed severity and AI drafts require human review. Synthetic acceptance does not establish commercial quality or customer demand.

## Run

Requires Node.js >=20.19. Download the source for this tag, then run `npm ci`, `npm run build`, `npm start` and open http://127.0.0.1:4317. Default without configuration is explicitly labeled offline Mock. Configure real credentials locally using `.env.example`; do not publish filled configuration or data.

The repository retains its SeminarRoom predecessor name and MIT provenance. This release targets the GTM feature branch and does not replace main or deploy a hosted service.
